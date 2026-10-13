import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, defer, firstValueFrom, from, map, timeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserDto } from '../models/user.model';
import { LoginRequest, LoginResponse, MessageResponse, PasswordResetRequest, RegisterRequest } from '../models/auth.model';
import { environment } from '../../../environments/environment';
import { AUTH_SESSION_OPTIONS } from '../auth/auth-request-policy';
import { AuthContractError, parseAuthMessageSuccess, parseEmptyAuthSuccess, parseRegisteredUser, parseSession } from '../auth/auth-contract';
import { classifyAuthError } from '../auth/auth-errors';
import { SessionOperationError, SessionSignedOutError } from '../auth/session-coordinator';
import { CookieSessionCoordinator } from './cookie-session-coordinator.service';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly coordinator = inject(CookieSessionCoordinator);
  private readonly base = environment.apiUrl.replace(/\/+$/, '');
  private loginPending = false;
  private pendingLoginVersion: number | null = null;
  private logoutPending = false;
  private migrationFailed = false;
  private renewal: { version: number; promise: Promise<LoginResponse> } | null = null;
  private readonly _message = signal<string | null>(null);
  private readonly _logoutStatus = signal<'idle' | 'pending' | 'confirmed' | 'uncertain'>('idle');
  readonly sessionMessage = this._message.asReadonly();
  readonly logoutStatus = this._logoutStatus.asReadonly();
  readonly token = this.session.token;
  readonly currentUser = this.session.user;
  readonly isAuthenticated = this.session.isAuthenticated;
  readonly recoveryRequired = computed(() => this.session.state() === 'blocked');

  constructor() {
    try {
      localStorage.removeItem('unita_token');
      localStorage.removeItem('unita_user');
    } catch {
      this.migrationFailed = true;
      this.session.invalidate('blocked');
      this._message.set('Não foi possível remover a sessão antiga. Verifique as permissões de armazenamento.');
    }
    const destroy = inject(DestroyRef);
    this.coordinator.invalidations$.pipe(takeUntilDestroyed(destroy)).subscribe(marker => {
      this.session.invalidate(marker.reason === 'blocked' ? 'blocked' : 'remote');
      this._message.set(marker.reason === 'blocked'
        ? 'Uma operação de sessão não foi confirmada. Aguarde a reconciliação.'
        : 'A sessão mudou em outra aba. Entre novamente para continuar.');
      this.navigateFromPrivatePage();
    });
    this.session.contextChanges$.pipe(takeUntilDestroyed(destroy)).subscribe(reason => {
      if (reason === 'expired') {
        // Renewal is driven by navigation/HTTP demand, never by an idle timer.
        this._message.set('Sua sessão precisa ser renovada para continuar.');
      }
    });
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return defer(() => from(this.performLogin(credentials)));
  }

  private async performLogin(credentials: LoginRequest): Promise<LoginResponse> {
    if (this.loginPending || this.logoutPending) throw new SessionOperationError('Aguarde a conclusão da operação de sessão em andamento.');
    if (this.migrationFailed) throw new SessionOperationError(this.sessionMessage()!);
    const version = this.session.invalidate('login', 'unknown');
    this.loginPending = true;
    this.pendingLoginVersion = version;
    this._message.set(null);
    this._logoutStatus.set('idle');
    try {
      this.coordinator.announce('login');
      const response = await firstValueFrom(this.coordinator.execute('login', () =>
        this.http.post<unknown>(`${this.base}/auth/login`, credentials, AUTH_SESSION_OPTIONS).pipe(map(parseSession)),
        () => this.session.version() === version));
      if (!this.session.accept(response, version)) throw new SessionOperationError('O contexto da sessão mudou. Entre novamente.');
      return response;
    } catch (error) {
      if (this.session.version() === version) {
        const kind = classifyAuthError('login', error).kind;
        const rejected = ['credentials', 'email-not-verified', 'account-disabled', 'csrf', 'validation'].includes(kind);
        this.session.invalidate(rejected ? 'cancelled' : 'blocked');
        this._message.set(error instanceof SessionOperationError ? error.message : classifyAuthError('login', error).message);
      }
      throw error;
    } finally { this.loginPending = false; this.pendingLoginVersion = null; }
  }

  cancelPendingLogin(): void {
    if (this.loginPending && this.pendingLoginVersion === this.session.version()) this.session.invalidate('cancelled');
  }

  /** Bootstrap and guards use the same in-tab renewal, globally serialized. */
  async restoreSession(): Promise<boolean> {
    if (this.getToken()) return true;
    if (this.session.state() !== 'unknown' && this.session.renewalOwner() === null) return false;
    try { await this.renewSession(this.session.version()); return this.isAuthenticated(); }
    catch { return false; }
  }

  async ensureAuthenticated(): Promise<boolean> { return this.restoreSession(); }

  /** Returns access only for the creating context; does not resurrect logout. */
  async accessToken(version: number, rejectedToken?: string): Promise<string> {
    if (version !== this.session.version()) throw new SessionOperationError('O contexto da sessão mudou.');
    const token = this.getToken();
    if (version !== this.session.version()) throw new SessionOperationError('O contexto da sessão mudou.');
    if (token && (rejectedToken === undefined || rejectedToken !== token)) return token;
    if (!token && this.session.state() !== 'unknown' && this.session.renewalOwner() === null) {
      throw new SessionOperationError('Faça login para continuar.');
    }
    const response = await this.renewSession(version);
    if (version !== this.session.version()) throw new SessionOperationError('O contexto da sessão mudou.');
    return response.token;
  }

  refresh(): Observable<LoginResponse> {
    return defer(() => from(this.renewSession(this.session.version())));
  }

  private renewSession(version: number): Promise<LoginResponse> {
    if (this.renewal?.version === version) return this.renewal.promise;
    if (version !== this.session.version() || this.migrationFailed || this.loginPending || this.logoutPending ||
        this.session.state() === 'blocked' || this.session.state() === 'anonymous' && this.session.renewalOwner() === null) {
      return Promise.reject(new SessionOperationError('Faça login para continuar.'));
    }
    const owner = this.currentUser()?.id ?? this.session.renewalOwner();
    const promise = this.performRenewal(version, owner).finally(() => {
      if (this.renewal?.promise === promise) this.renewal = null;
    });
    this.renewal = { version, promise };
    return promise;
  }

  private async performRenewal(version: number, owner: number | null): Promise<LoginResponse> {
    try {
      const response = await firstValueFrom(this.coordinator.execute('refresh', () => this.http.post<unknown>(
        `${this.base}/auth/refresh`, {}, AUTH_SESSION_OPTIONS
      ).pipe(map(value => {
        const response = parseSession(value);
        if (owner !== null && response.user.id !== owner) throw new AuthContractError();
        return response;
      })), () => this.session.version() === version));
      if (!this.session.accept(response, version)) throw new SessionOperationError('O contexto da sessão mudou. Entre novamente.');
      this._message.set(null);
      return response;
    } catch (error) {
      if (version === this.session.version()) {
        const rejected = error instanceof SessionSignedOutError || classifyAuthError('refresh', error).kind === 'session-expired';
        this.session.invalidate(rejected ? 'cancelled' : 'blocked');
        this._message.set(rejected ? 'Sua sessão terminou. Entre novamente para continuar.'
          : 'Não foi possível confirmar a renovação da sessão. Consulte as orientações de recuperação.');
        this.navigateFromPrivatePage();
      }
      throw error;
    }
  }

  endRecovery(): void {
    this.session.invalidate('cancelled');
    this._message.set('Sua sessão não foi aceita após a renovação. Entre novamente para continuar.');
    this.navigateFromPrivatePage();
  }

  register(data: RegisterRequest): Observable<UserDto> {
    const { firstName, lastName, email, dateOfBirth, password } = data;
    return this.http.post<unknown>(`${this.base}/auth/register`, { firstName, lastName, email, dateOfBirth, password },
      { observe: 'response' }).pipe(timeout(15_000), map(parseRegisteredUser));
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.get(`${this.base}/auth/verify-email`, { params: { token }, observe: 'response', responseType: 'text' })
      .pipe(timeout(15_000), map(response => parseEmptyAuthSuccess(response, 200)));
  }

  resendVerification(email: string): Observable<void> {
    return this.http.post(`${this.base}/auth/resend-verification`, { email }, { observe: 'response', responseType: 'text' })
      .pipe(timeout(15_000), map(response => parseEmptyAuthSuccess(response, 200)));
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<unknown>(`${this.base}/password/forgot`, { email }, { observe: 'response' })
      .pipe(timeout(15_000), map(parseAuthMessageSuccess));
  }

  validateResetToken(token: string): Observable<MessageResponse> {
    return this.http.get<unknown>(`${this.base}/password/reset/validate`, { params: { token }, observe: 'response' })
      .pipe(timeout(15_000), map(parseAuthMessageSuccess));
  }

  /** Own an initiated reset even if its page goes away; never repeat this POST. */
  resetPassword(data: PasswordResetRequest): Observable<MessageResponse> {
    return defer(() => from(firstValueFrom(this.http.post<unknown>(`${this.base}/password/reset`,
      { token: data.token, newPassword: data.newPassword }, { observe: 'response' }).pipe(
        timeout(15_000), map(parseAuthMessageSuccess), map(response => {
          this.session.invalidate('logout');
          this._message.set('Sua senha foi alterada. Faça login para continuar.');
          try { this.coordinator.announce('logout'); } catch {
            this._message.set('Sua senha foi alterada. Feche as outras abas da aplicação e faça login novamente.');
          }
          return response;
        })
      ))));
  }

  logout(): void {
    if (this.logoutPending) return;
    const version = this.session.invalidate('logout');
    this.logoutPending = true;
    this._logoutStatus.set('pending');
    this._message.set('A saída local foi concluída. A revogação no servidor está em andamento.');
    void this.router.navigate(['/login']);
    // Local invalidation never waits for a lock or the HTTP response.
    void this.performLogout(version);
  }

  private async performLogout(version: number): Promise<void> {
    try {
      this.coordinator.announce('logout');
      await firstValueFrom(this.coordinator.execute('logout', () => this.http.post(
        `${this.base}/auth/logout`, {}, { ...AUTH_SESSION_OPTIONS, observe: 'response', responseType: 'text' }
      ).pipe(map(response => parseEmptyAuthSuccess(response, 204))), () => this.session.version() === version));
      this._logoutStatus.set('confirmed');
      if (version === this.session.version()) this._message.set(null);
    } catch {
      this._logoutStatus.set('uncertain');
      if (version === this.session.version()) this.session.invalidate('blocked');
      this._message.set('Você saiu da aplicação, mas a revogação no servidor não foi confirmada. Aguarde a reconciliação antes de entrar novamente.');
    } finally { this.logoutPending = false; }
  }

  getToken(): string | null { return this.session.getToken(); }

  private navigateFromPrivatePage(): void {
    const path = (this.router.url ?? '').split(/[?#]/)[0].split('/')[1];
    if (['dashboard', 'pockets', 'investments', 'credit-cards', 'groups', 'transfers', 'registries'].includes(path)) {
      void this.router.navigate(['/login']);
    }
  }
}
