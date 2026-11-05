import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, Subject, defer, filter, takeUntil } from 'rxjs';
import { LoginResponse } from '../models/auth.model';
import { UserDto } from '../models/user.model';
import { INVESTMENT_SALE_STORAGE_KEY } from '../utils/investment-sale-storage';
import { parseSession, sessionExpiresAt } from '../auth/auth-contract';

export type SessionState = 'unknown' | 'authenticated' | 'anonymous' | 'blocked';
export type SessionEndReason = 'login' | 'logout' | 'remote' | 'expired' | 'blocked' | 'cancelled' | 'destroyed';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly _state = signal<SessionState>('unknown');
  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<UserDto | null>(null);
  private readonly _version = signal(0);
  private readonly _expiresAt = signal<number | null>(null);
  private readonly _renewalOwner = signal<number | null>(null);
  private readonly changes = new Subject<SessionEndReason>();
  private readonly updates = new Subject<void>();
  private readonly cleanups = new Set<() => void>();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  readonly state = this._state.asReadonly();
  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly version = this._version.asReadonly();
  readonly expiresAt = this._expiresAt.asReadonly();
  readonly renewalOwner = this._renewalOwner.asReadonly();
  readonly contextChanges$ = this.changes.asObservable();
  readonly sessionUpdates$ = this.updates.asObservable();
  readonly isAuthenticated = computed(() => this.state() === 'authenticated' && !!this.token() && !!this.user());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.invalidate('destroyed');
      this.changes.complete();
      this.updates.complete();
    });
  }

  registerCleanup(cleanup: () => void, owner: DestroyRef): void {
    this.cleanups.add(cleanup);
    owner.onDestroy(() => this.cleanups.delete(cleanup));
  }

  invalidate(reason: SessionEndReason, state: SessionState = reason === 'blocked' ? 'blocked' : 'anonymous'): number {
    if (reason !== 'expired' && reason !== 'destroyed') {
      try { sessionStorage.removeItem(INVESTMENT_SALE_STORAGE_KEY); } catch { /* Storage can be disabled. */ }
    }
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this._renewalOwner.set(reason === 'expired' ? this.user()?.id ?? this.renewalOwner() : null);
    this._version.update(value => value + 1);
    this._token.set(null); this._user.set(null); this._expiresAt.set(null); this._state.set(state);
    this.changes.next(reason);
    for (const cleanup of this.cleanups) cleanup();
    return this.version();
  }

  accept(value: unknown, version: number): boolean {
    const response: LoginResponse = parseSession(value);
    if (version !== this.version() || this.state() === 'blocked') return false;
    this._token.set(response.token); this._user.set(response.user);
    this._renewalOwner.set(null);
    this._expiresAt.set(sessionExpiresAt(response.expiresIn)); this._state.set('authenticated');
    this.scheduleExpiry(version);
    this.updates.next();
    return true;
  }

  getToken(): string | null {
    if (!this.isAuthenticated()) return null;
    if ((this.expiresAt() ?? 0) <= Date.now()) { this.invalidate('expired'); return null; }
    return this.token();
  }

  private scheduleExpiry(version: number): void {
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    const remaining = (this.expiresAt() ?? 0) - Date.now();
    this.expiryTimer = setTimeout(() => {
      if (version !== this.version()) return;
      if ((this.expiresAt() ?? 0) > Date.now()) this.scheduleExpiry(version);
      else this.invalidate('expired');
    }, Math.min(Math.max(remaining, 0), 2_147_483_647));
  }

  /** Bind to the creating context, cancel on invalidation, reject stale emissions. */
  scoped<T>(request: () => Observable<T>): Observable<T> {
    // Expiry must be observed before binding a new operation to its context.
    this.getToken();
    const version = this.version();
    return defer(() => {
      if (version !== this.version()) return EMPTY;
      return request().pipe(takeUntil(this.contextChanges$), filter(() => version === this.version()));
    });
  }
}
