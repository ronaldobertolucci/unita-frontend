import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AUTH_RECOVERY_ATTEMPTED, authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { syntheticSession } from '../testing/session.mock';
import { COORDINATION_BROWSER } from '../services/cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { Router } from '@angular/router';

describe('Unita HTTP policy and bounded session recovery', () => {
  let http: HttpClient, backend: HttpTestingController, session: SessionService, auth: AuthService;
  let logout: jest.SpyInstance;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: COORDINATION_BROWSER, useValue: coordinationHarness().browser('A') },
      { provide: Router, useValue: { url: '/dashboard', navigate: jest.fn().mockResolvedValue(true) } }
    ] });
    session = TestBed.inject(SessionService); session.accept(syntheticSession(), session.version());
    http = TestBed.inject(HttpClient); backend = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthService); logout = jest.spyOn(auth, 'logout');
  });
  afterEach(() => { backend.verify(); TestBed.resetTestingModule(); });
  it('adds Bearer to /auth/me despite the auth prefix', () => {
    http.get('/api/auth/me').subscribe(); const request = backend.expectOne('/api/auth/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-1'); request.flush({});
  });
  it.each(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'])('sends cookies/CSRF but no Bearer to %s', url => {
    http.post(url, {}, { headers: { Authorization: 'Bearer obsolete-token' } }).subscribe({ error: () => {} }); const request = backend.expectOne(url);
    expect(request.request.withCredentials).toBe(true); expect(request.request.headers.get('X-CSRF-Protection')).toBe('1');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });
    expect(logout).not.toHaveBeenCalled(); expect(session.isAuthenticated()).toBe(true);
  });
  it.each(['/api/auth/register', '/api/password/forgot', 'https://outside.example/api/auth/login', '/assets/photo.png', '/api/unknown'])('does not attach authentication to %s', url => {
    http.post(url, {}).subscribe(); const request = backend.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false); expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.has('X-CSRF-Protection')).toBe(false); request.flush({});
  });
  it('does not dispatch a protected request while access is closed', async () => {
    session.invalidate('logout'); const error = jest.fn(); http.get('/api/pockets/my').subscribe({ error });
    await flushCoordination(); backend.expectNone('/api/pockets/my'); expect(error).toHaveBeenCalledTimes(1);
  });
  it('renews a known protected 401 once and retries using the new token', async () => {
    const next = jest.fn(); http.get('/api/pockets/my').subscribe(next);
    backend.expectOne('/api/pockets/my').flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); const refresh = backend.expectOne('/api/auth/refresh');
    expect(refresh.request.headers.has('Authorization')).toBe(false); expect(refresh.request.withCredentials).toBe(true);
    refresh.flush({ ...syntheticSession(), token: 'renewed' }); await flushCoordination();
    const retried = backend.expectOne('/api/pockets/my');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer renewed');
    expect(retried.request.context.get(AUTH_RECOVERY_ATTEMPTED)).toBe(true);
    retried.flush([]); expect(next).toHaveBeenCalledWith([]); expect(logout).not.toHaveBeenCalled();
  });
  it.each([401,403,429,500])('does not end session for unrelated/unknown HTTP %s', status => {
    http.get('/api/pockets/my').subscribe({ error: () => {} }); backend.expectOne('/api/pockets/my').flush(
      { message: 'unknown' }, { status, statusText: 'Error' });
    expect(session.isAuthenticated()).toBe(true); expect(logout).not.toHaveBeenCalled();
  });
  it('cancels a protected request on context change so stale data never reaches the subscriber', () => {
    const next = jest.fn(); http.get('/api/pockets/my').subscribe(next); const request = backend.expectOne('/api/pockets/my');
    session.invalidate('login', 'unknown'); session.accept(syntheticSession(2), session.version());
    expect(request.cancelled).toBe(true); expect(next).not.toHaveBeenCalled();
  });

  it('shares a refresh for concurrent 401s and reuses its token for a late old-token rejection', async () => {
    for (const url of ['/api/auth/me', '/api/pockets/my', '/api/assets']) http.get(url).subscribe();
    const me = backend.expectOne('/api/auth/me'), pockets = backend.expectOne('/api/pockets/my'), late = backend.expectOne('/api/assets');
    for (const request of [me, pockets]) request.flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); backend.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'renewed' });
    await flushCoordination();
    backend.expectOne('/api/auth/me').flush({}); backend.expectOne('/api/pockets/my').flush([]);
    late.flush({ code: 'AUTHENTICATION_REQUIRED' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); backend.expectNone('/api/auth/refresh');
    const retry = backend.expectOne('/api/assets'); expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed'); retry.flush([]);
  });
  it('does not renew an idle expired session until protected demand, then shares renewal', async () => {
    jest.useFakeTimers(); session.accept({ ...syntheticSession(), expiresIn: 1 }, session.version());
    jest.advanceTimersByTime(1001); backend.expectNone('/api/auth/refresh');
    http.get('/api/pockets/my').subscribe(); http.get('/api/assets').subscribe();
    await flushCoordination(); backend.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'renewed' });
    await flushCoordination(); backend.expectOne('/api/pockets/my').flush([]); backend.expectOne('/api/assets').flush([]);
    expect(session.user()?.id).toBe(1); jest.useRealTimers();
  });
  it('a second known 401 closes access without another rotation or logout', async () => {
    http.get('/api/auth/me').subscribe({ error: () => {} });
    backend.expectOne('/api/auth/me').flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); backend.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'renewed' });
    await flushCoordination(); backend.expectOne('/api/auth/me').flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); expect(session.state()).toBe('anonymous'); backend.expectNone('/api/auth/refresh'); expect(logout).not.toHaveBeenCalled();
  });
  it('honors a request already marked as attempted', () => {
    http.get('/api/auth/me', { context: new HttpContext().set(AUTH_RECOVERY_ATTEMPTED, true) }).subscribe({ error: () => {} });
    backend.expectOne('/api/auth/me').flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    backend.expectNone('/api/auth/refresh'); expect(session.isAuthenticated()).toBe(false);
  });
  it.each([
    ['POST', '/api/transfers'], ['POST', '/api/transfers/fgts/withdrawal'],
    ['POST', '/api/assets/1/transactions/buy'], ['POST', '/api/assets/1/transactions/yield'],
    ['POST', '/api/pockets/1/transactions'], ['PUT', '/api/credit-cards/1/bills/2/pay'],
    ['DELETE', '/api/pockets/1/transactions/2'], ['DELETE', '/api/pockets/bank-accounts/1'],
    ['DELETE', '/api/pockets/benefit-accounts/1'], ['DELETE', '/api/pockets/fgts/1'], ['DELETE', '/api/credit-cards/1'],
  ])('recovers authentication without repeating %s %s', async (method, url) => {
    const error = jest.fn();
    http.request(method, url, { body: { amount: 80 } }).subscribe({ error });
    backend.expectOne(url).flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination();
    backend.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'renewed' });
    await flushCoordination();
    backend.expectNone(url);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(session.isAuthenticated()).toBe(true);
  });
  it.each([0, 401, 403, 429, 500])('never repeats a financial write on unrelated HTTP %s', status => {
    http.post('/api/transfers', { amount: 10 }).subscribe({ error: () => {} }); const request = backend.expectOne('/api/transfers');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ code: 'UNRECOGNIZED' }, { status, statusText: 'Error' });
    backend.expectNone('/api/auth/refresh'); backend.expectNone('/api/transfers'); expect(session.isAuthenticated()).toBe(true);
  });
  it('cancelled demand is never retried even though a shared refresh finishes', async () => {
    const next = jest.fn(); const subscription = http.get('/api/auth/me').subscribe({ next });
    backend.expectOne('/api/auth/me').flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); const refresh = backend.expectOne('/api/auth/refresh'); subscription.unsubscribe();
    expect(refresh.cancelled).toBe(false); refresh.flush({ ...syntheticSession(), token: 'renewed' }); await flushCoordination();
    backend.expectNone('/api/auth/me'); expect(next).not.toHaveBeenCalled();
  });
  it('account change during refresh rejects the original write and clears account A', async () => {
    http.post('/api/transfers', { amount: 10 }).subscribe({ error: () => {} });
    backend.expectOne('/api/transfers').flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); backend.expectOne('/api/auth/refresh').flush(syntheticSession(2)); await flushCoordination();
    backend.expectNone('/api/transfers'); expect(session.state()).toBe('blocked'); expect(session.user()).toBeNull();
  });
  it('logout while waiting for refresh cancels the original write and cannot be undone by its reply', async () => {
    http.post('/api/transfers', { amount: 10 }).subscribe({ error: () => {} });
    backend.expectOne('/api/transfers').flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); const refresh = backend.expectOne('/api/auth/refresh'); auth.logout(); refresh.flush(syntheticSession());
    await flushCoordination(); backend.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await flushCoordination(); backend.expectNone('/api/transfers'); expect(session.isAuthenticated()).toBe(false);
  });
  it.each([401, 500, 0])('refresh HTTP %s never repeats the original protected demand', async status => {
    http.get('/api/auth/me').subscribe({ error: () => {} });
    backend.expectOne('/api/auth/me').flush({ code: 'INVALID_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); const refresh = backend.expectOne('/api/auth/refresh');
    if (status === 0) refresh.error(new ProgressEvent('error'));
    else refresh.flush({ code: 'SESSION_EXPIRED' }, { status, statusText: 'Error' });
    await flushCoordination(); backend.expectNone('/api/auth/me');
    expect(session.state()).toBe(status === 401 ? 'anonymous' : 'blocked');
  });
});
