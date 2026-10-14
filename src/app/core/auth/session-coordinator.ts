import { Observable, Subject, defer, firstValueFrom, from, timeout } from 'rxjs';
import { isRecord } from './auth-contract';

export type CookieOperation = 'login' | 'refresh' | 'logout';
type OperationState = 'pending' | 'ready' | 'signed-out' | 'blocked';
interface OperationMarker { protocol: 1; id: string; operation: CookieOperation; state: OperationState; }
export interface SessionInvalidation { protocol: 1; id: string; reason: 'login' | 'logout' | 'blocked'; }
export interface CoordinationBrowser {
  secure: boolean;
  locks?: Pick<LockManager, 'request'>;
  read(key: string): string | null;
  write(key: string, value: string): void;
  id(): string;
  channel(name: string): Pick<BroadcastChannel, 'onmessage' | 'postMessage' | 'close'> | null;
  listen(callback: (event: Pick<StorageEvent, 'key' | 'newValue'>) => void): () => void;
}

export class SessionOperationError extends Error {
  constructor(message = 'A operação de sessão não foi confirmada. Aguarde a reconciliação antes de entrar novamente.') {
    super(message);
    this.name = 'SessionOperationError';
  }
}

/** A known local logout/rejection must not be mistaken for an uncertain rotation. */
export class SessionSignedOutError extends SessionOperationError {
  constructor() { super('Entre novamente para continuar.'); }
}

function decode(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value['protocol'] !== 1 || typeof value['id'] !== 'string' ||
      !value['id'] || value['id'].length > 200) throw new SessionOperationError();
  return value;
}

function parseOperation(raw: string | null): OperationMarker | null {
  const value = decode(raw);
  if (!value) return null;
  if (!['login', 'refresh', 'logout'].includes(String(value['operation'])) ||
      !['pending', 'ready', 'signed-out', 'blocked'].includes(String(value['state'])) ||
      Object.keys(value).some(key => !['protocol', 'id', 'operation', 'state'].includes(key))) throw new SessionOperationError();
  return value as unknown as OperationMarker;
}

function parseInvalidation(raw: string | null): SessionInvalidation | null {
  const value = decode(raw);
  if (!value) return null;
  if (!['login', 'logout', 'blocked'].includes(String(value['reason'])) ||
      Object.keys(value).some(key => !['protocol', 'id', 'reason'].includes(key))) throw new SessionOperationError();
  return value as unknown as SessionInvalidation;
}

function definitiveRejection(operation: CookieOperation, error: unknown): boolean {
  if (!isRecord(error)) return false;
  // Rate limiting rejects the request before cookie issuance/rotation/revocation.
  // A proxy may return an empty or non-JSON body, so status is the evidence.
  if (error['status'] === 429) return true;
  let body: unknown = error['error'];
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return false; } }
  if (!isRecord(body)) return false;
  const status = error['status'], code = body['code'];
  if (status === 403 && code === 'CSRF_PROTECTION_REQUIRED') return true;
  if (operation === 'refresh') return status === 401 && code === 'SESSION_EXPIRED';
  return operation === 'login' && (
    status === 401 && !code && body['message'] === 'Invalid email or password' ||
    status === 403 && (code === 'EMAIL_NOT_VERIFIED' || code === 'ACCOUNT_DISABLED') ||
    status === 400 && body['error'] === 'Validation Failed'
  );
}

/** Owns HTTP until a known result or timeout, independent of UI subscriptions. */
export class CookieSessionCoordinatorEngine {
  readonly key: string;
  readonly invalidationKey: string;
  private readonly events = new Subject<SessionInvalidation>();
  readonly invalidations$ = this.events.asObservable();
  private readonly channel: ReturnType<CoordinationBrowser['channel']>;
  private readonly unlisten: () => void;
  private seenInvalidation: string | null = null;

  constructor(private readonly browser: CoordinationBrowser, api: string, base: string,
      private readonly waitMs = 20_000, private readonly operationMs = 15_000) {
    const url = new URL(api, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new SessionOperationError('A origem da API está configurada incorretamente.');
    }
    this.key = `unita:session:v1:${url.href.replace(/\/+$/, '')}:operation`;
    this.invalidationKey = `${this.key}:invalidation`;
    try { this.channel = browser.channel(this.invalidationKey); } catch { this.channel = null; }
    if (this.channel) this.channel.onmessage = event => this.receive(JSON.stringify(event.data));
    this.unlisten = browser.listen(event => {
      if (event.key === this.invalidationKey) this.receive(event.newValue);
    });
  }

  private receive(raw: string | null): void {
    try {
      const marker = parseInvalidation(raw);
      // Messages never accept a session. Require current persisted metadata;
      // delayed/replayed channel and storage events cannot undo invalidation.
      if (!marker || marker.id === this.seenInvalidation ||
          raw !== this.browser.read(this.invalidationKey)) return;
      this.seenInvalidation = marker.id;
      this.events.next(marker);
    } catch {
      this.events.next({ protocol: 1, id: 'invalid-metadata', reason: 'blocked' });
    }
  }

  announce(reason: SessionInvalidation['reason']): void {
    const marker: SessionInvalidation = { protocol: 1, id: this.browser.id(), reason };
    this.write(this.invalidationKey, marker);
    this.seenInvalidation = marker.id;
    if (reason === 'blocked') this.events.next(marker);
    try { this.channel?.postMessage(marker); } catch {
      // Persisted invalidation is also delivered through storage events.
    }
  }

  private write(key: string, marker: OperationMarker | SessionInvalidation): void {
    try { this.browser.write(key, JSON.stringify(marker)); } catch {
      throw new SessionOperationError('O navegador não permite coordenar a sessão. Verifique o armazenamento.');
    }
  }

  execute<T>(operation: CookieOperation, request: () => Observable<T>, canStart = () => true): Observable<T> {
    return defer(() => from(this.exclusive(operation, request, canStart)));
  }

  private async exclusive<T>(operation: CookieOperation, request: () => Observable<T>, canStart: () => boolean): Promise<T> {
    if (!this.browser.secure || !this.browser.locks || !this.channel) {
      throw new SessionOperationError('A sessão requer HTTPS, Web Locks e comunicação entre abas disponíveis.');
    }
    const abort = new AbortController();
    const waiting = setTimeout(() => abort.abort(), this.waitMs);
    try {
      return await this.browser.locks.request(`${this.key}:cookie`, { signal: abort.signal }, async () => {
        clearTimeout(waiting);
        let previous: OperationMarker | null;
        try { previous = parseOperation(this.browser.read(this.key)); } catch { throw new SessionOperationError(); }
        if (previous && (previous.state === 'pending' || previous.state === 'blocked')) throw new SessionOperationError();
        if (operation === 'refresh' && previous?.state === 'signed-out') throw new SessionSignedOutError();
        if (!canStart()) throw new SessionOperationError('O contexto da sessão mudou. Faça login novamente.');
        const marker: OperationMarker = { protocol: 1, id: this.browser.id(), operation, state: 'pending' };
        this.write(this.key, marker);
        try {
          const result = await firstValueFrom(request().pipe(timeout(this.operationMs)));
          const current = parseOperation(this.browser.read(this.key));
          if (current?.id !== marker.id || current.state !== 'pending') throw new SessionOperationError();
          this.write(this.key, { ...marker, state: operation === 'logout' ? 'signed-out' : 'ready' });
          return result;
        } catch (error) {
          const state = definitiveRejection(operation, error) ? 'signed-out' : 'blocked';
          this.write(this.key, { ...marker, state });
          if (state === 'blocked') this.announce('blocked');
          throw error;
        }
      });
    } catch (error) {
      if (abort.signal.aborted) throw new SessionOperationError('A sessão está ocupada em outra aba. Aguarde sua conclusão.');
      throw error;
    } finally { clearTimeout(waiting); }
  }

  dispose(): void {
    this.channel?.close();
    this.unlisten();
    this.events.complete();
  }
}
