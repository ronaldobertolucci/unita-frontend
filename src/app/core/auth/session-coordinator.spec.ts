import { Subject, firstValueFrom, of, throwError } from 'rxjs';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { CookieSessionCoordinatorEngine, SessionOperationError } from './session-coordinator';

const base = 'https://unita.rws.home/';
describe('cookie operations across independent Unita tabs', () => {
  let harness: ReturnType<typeof coordinationHarness>;
  let clients: CookieSessionCoordinatorEngine[];
  const client = (name: string, options = {}) => {
    const engine = new CookieSessionCoordinatorEngine({ ...harness.browser(name), ...options }, '/api', base, 50, 100);
    clients.push(engine); return engine;
  };
  beforeEach(() => { harness = coordinationHarness(); clients = []; });
  afterEach(() => { for (const engine of clients) engine.dispose(); jest.useRealTimers(); });

  it('serializes refresh and observes the cookie already rotated by the first tab', async () => {
    const a = client('A'), b = client('B');
    let cookie = 0; const seen: number[] = []; const pending = new Subject<number>();
    const one = firstValueFrom(a.execute('refresh', () => { seen.push(cookie); return pending; }));
    const two = firstValueFrom(b.execute('refresh', () => { seen.push(cookie); return of(++cookie); }));
    await flushCoordination(); expect(seen).toEqual([0]);
    pending.next(++cookie); pending.complete();
    expect(await one).toBe(1); expect(await two).toBe(2); expect(seen).toEqual([0, 1]);
  });

  it('uses the same lock for login, refresh and logout and does not steal it while waiting', async () => {
    const a = client('A'), b = client('B'); const pending = new Subject<void>(); const calls: string[] = [];
    const first = firstValueFrom(a.execute('login', () => { calls.push('login'); return pending; }));
    const second = firstValueFrom(b.execute('logout', () => { calls.push('logout'); return of(undefined); }));
    await flushCoordination(); expect(calls).toEqual(['login']);
    pending.next(); pending.complete(); await first; await second;
    expect(calls).toEqual(['login', 'logout']);
    const request = jest.fn(() => of({}));
    await expect(firstValueFrom(a.execute('refresh', request))).rejects.toThrow(SessionOperationError);
    expect(request).not.toHaveBeenCalled();
    await expect(firstValueFrom(a.execute('login', () => of({})))).resolves.toEqual({});
  });

  it('continues owning the HTTP subscription and lock after its UI subscriber leaves', async () => {
    const a = client('A'), b = client('B'), pending = new Subject<void>();
    const subscription = a.execute('login', () => pending).subscribe();
    await flushCoordination(); subscription.unsubscribe();
    const request = jest.fn(() => of({}));
    const next = firstValueFrom(b.execute('logout', request));
    await flushCoordination(); expect(request).not.toHaveBeenCalled(); expect(pending.observed).toBe(true);
    pending.next(); pending.complete(); await next; expect(request).toHaveBeenCalledTimes(1);
  });

  it('persists uncertainty after a lost refresh response, including a new tab/reload', async () => {
    const a = client('A'); const request = jest.fn(() => of({}));
    await expect(firstValueFrom(a.execute('refresh', () => throwError(() => ({ status: 0 }))))).rejects.toEqual({ status: 0 });
    const reloaded = client('reload');
    for (const operation of ['refresh', 'login', 'logout'] as const) {
      await expect(firstValueFrom(reloaded.execute(operation, request))).rejects.toThrow(SessionOperationError);
    }
    expect(request).not.toHaveBeenCalled();
    expect(JSON.parse(harness.storage.get(a.key)!).state).toBe('blocked');
  });

  it('treats an abandoned pending marker as uncertain instead of retrying after lock release', async () => {
    const a = client('A');
    harness.storage.set(a.key, JSON.stringify({ protocol: 1, id: 'abandoned', operation: 'refresh', state: 'pending' }));
    const request = jest.fn(() => of({}));
    await expect(firstValueFrom(client('B').execute('login', request))).rejects.toThrow(SessionOperationError);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not mark credential or structured refresh rejection as an uncertain commit', async () => {
    const a = client('A');
    for (const [operation, error] of [
      ['login', { status: 401, error: { message: 'Invalid email or password' } }],
      ['login', { status: 403, error: { code: 'ACCOUNT_DISABLED' } }],
      ['refresh', { status: 401, error: { code: 'SESSION_EXPIRED' } }]
    ] as const) {
      await firstValueFrom(a.execute('login', () => of({})));
      await expect(firstValueFrom(a.execute(operation, () => throwError(() => error)))).rejects.toEqual(error);
      expect(JSON.parse(harness.storage.get(a.key)!).state).toBe('signed-out');
    }
  });

  it('invalidates other tabs immediately, persists only metadata and ignores delayed messages', async () => {
    const a = client('A'), b = client('B'); const received = jest.fn(); b.invalidations$.subscribe(received);
    a.announce('logout'); const old = harness.storage.get(a.invalidationKey)!;
    await flushCoordination(); expect(received).toHaveBeenCalledTimes(1);
    a.announce('login'); await flushCoordination(); expect(received).toHaveBeenCalledTimes(2);
    // Replayed event is compared against the latest persisted invalidation.
    (b as unknown as { receive(value: string): void }).receive(old);
    expect(received).toHaveBeenCalledTimes(2);
    await firstValueFrom(a.execute('login', () => of({ token: 'private', email: 'private@example.com' })));
    const persisted = JSON.stringify([...harness.storage.entries()]);
    expect(persisted).not.toContain('private'); expect(persisted).not.toContain('Bearer');
  });

  it.each([{ secure: false }, { locks: undefined }, { channel: () => null }])('closes access when necessary browser resources are unavailable: %p', async options => {
    const a = client('A', options); const request = jest.fn(() => of({}));
    await expect(firstValueFrom(a.execute('login', request))).rejects.toThrow(SessionOperationError);
    expect(request).not.toHaveBeenCalled();
  });

  it('closes access on denied/corrupt storage and rejects a queued obsolete context before sending HTTP', async () => {
    const a = client('A');
    const request = jest.fn(() => of({}));
    await expect(firstValueFrom(a.execute('login', request, () => false))).rejects.toThrow(SessionOperationError);
    expect(request).not.toHaveBeenCalled();
    harness.storage.set(a.key, 'not JSON');
    await expect(firstValueFrom(a.execute('login', request))).rejects.toThrow(SessionOperationError);
    harness.denyStorage();
    await expect(firstValueFrom(a.execute('login', request))).rejects.toThrow(SessionOperationError);
  });

  it('times out an HTTP operation without authorizing a second rotation', async () => {
    jest.useFakeTimers(); const a = client('A'), b = client('B'); const pending = new Subject<void>();
    const failure = firstValueFrom(a.execute('refresh', () => pending)).catch(error => error);
    await flushCoordination(); jest.advanceTimersByTime(101); await flushCoordination();
    expect((await failure).name).toBe('TimeoutError');
    const request = jest.fn(() => of({}));
    await expect(firstValueFrom(b.execute('refresh', request))).rejects.toThrow(SessionOperationError);
    expect(request).not.toHaveBeenCalled();
  });

  it('a bounded lock wait aborts only the waiter, leaving the owner in control', async () => {
    jest.useFakeTimers(); const a = client('A'), b = client('B'); const pending = new Subject<void>();
    const owner = firstValueFrom(a.execute('login', () => pending));
    const request = jest.fn(() => of({}));
    const waiter = firstValueFrom(b.execute('refresh', request)).catch(error => error);
    await flushCoordination(); jest.advanceTimersByTime(51); await flushCoordination();
    expect(await waiter).toBeInstanceOf(SessionOperationError); expect(request).not.toHaveBeenCalled();
    expect(JSON.parse(harness.storage.get(a.key)!).state).toBe('pending');
    pending.next(); pending.complete(); await owner;
  });
});
