import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { CookieSessionCoordinator, COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';
import { AuthContractError } from '../auth/auth-contract';
import { SessionOperationError } from '../auth/session-coordinator';
import { firstValueFrom } from 'rxjs';

describe('coordinated login/logout in memory', () => {
  let auth: AuthService, session: SessionService, http: HttpTestingController;
  let harness: ReturnType<typeof coordinationHarness>;
  let router: { navigate: jest.Mock; url: string };
  beforeEach(() => {
    localStorage.clear(); harness = coordinationHarness(); router = { navigate: jest.fn().mockResolvedValue(true), url: '/login' };
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: Router, useValue: router }, { provide: COORDINATION_BROWSER, useValue: harness.browser('A') }
    ] });
    session = TestBed.inject(SessionService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); localStorage.clear(); });
  const start = async () => {
    auth = TestBed.inject(AuthService);
    const promise = firstValueFrom(auth.login({ email: 'user1@example.com', password: ' exact password ' }));
    await flushCoordination(); return { promise, request: http.expectOne('/api/auth/login') };
  };

  it('removes legacy storage without restoring it', () => {
    localStorage.setItem('unita_token', 'legacy'); localStorage.setItem('unita_user', 'invalid user');
    auth = TestBed.inject(AuthService);
    expect(auth.getToken()).toBeNull(); expect(auth.currentUser()).toBeNull(); expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('unita_token')).toBeNull(); expect(localStorage.getItem('unita_user')).toBeNull();
    http.expectNone('/api/auth/refresh');
  });
  it('accepts only the complete session with exact password, CSRF and credentials, never persists JWT/user', async () => {
    const { promise, request } = await start();
    expect(request.request.withCredentials).toBe(true); expect(request.request.headers.get('X-CSRF-Protection')).toBe('1');
    expect(request.request.headers.has('Authorization')).toBe(false); expect(request.request.body.password).toBe(' exact password ');
    request.flush(syntheticSession()); await promise;
    expect(auth.isAuthenticated()).toBe(true); expect(auth.currentUser()?.id).toBe(1); expect(auth.getToken()).toBe('synthetic-1');
    expect(localStorage.getItem('unita_token')).toBeNull(); expect(localStorage.getItem('unita_user')).toBeNull();
    expect(JSON.stringify([...harness.storage.values()])).not.toContain('synthetic-1');
  });
  it('rejects malformed success and blocks blind login/refresh after uncertain issuance', async () => {
    const { promise, request } = await start(); const rejected = promise.catch(error => error);
    request.flush({ token: 'invalid' }); expect(await rejected).toBeInstanceOf(AuthContractError);
    expect(session.state()).toBe('blocked'); expect(auth.getToken()).toBeNull();
    await expect(firstValueFrom(auth.login({ email: 'user1@example.com', password: 'password' }))).rejects.toThrow(SessionOperationError);
    http.expectNone('/api/auth/login');
  });
  it('a failed account switch clears the prior user/data and never calls refresh', async () => {
    auth = TestBed.inject(AuthService); session.accept(syntheticSession(), session.version());
    const { promise, request } = await start(); const rejected = promise.catch(error => error);
    expect(auth.currentUser()).toBeNull();
    request.flush({ message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });
    await rejected; expect(session.state()).toBe('anonymous'); http.expectNone('/api/auth/refresh'); http.expectNone('/api/auth/logout');
  });
  it('invalidates immediately and revokes remotely with a 204 empty response', async () => {
    const { promise, request } = await start(); request.flush(syntheticSession()); await promise;
    auth.logout(); expect(auth.getToken()).toBeNull(); expect(auth.currentUser()).toBeNull();
    expect(router.navigate).toHaveBeenCalledTimes(1); expect(auth.logoutStatus()).toBe('pending');
    await flushCoordination(); const logout = http.expectOne('/api/auth/logout');
    expect(logout.request.withCredentials).toBe(true); expect(logout.request.headers.get('X-CSRF-Protection')).toBe('1');
    expect(logout.request.headers.has('Authorization')).toBe(false);
    auth.logout(); http.expectNone('/api/auth/logout');
    logout.flush(null, { status: 204, statusText: 'No Content' }); await flushCoordination();
    expect(auth.logoutStatus()).toBe('confirmed'); expect(auth.sessionMessage()).toBeNull();
  });
  it('logout during login waits for its remote lock and the late login never reopens access', async () => {
    const { promise, request } = await start(); const old = promise.catch(error => error);
    auth.logout(); auth.cancelPendingLogin(); await flushCoordination(); http.expectNone('/api/auth/logout');
    request.flush(syntheticSession()); expect(await old).toBeInstanceOf(SessionOperationError);
    await flushCoordination(); http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await flushCoordination(); expect(auth.getToken()).toBeNull(); expect(auth.logoutStatus()).toBe('confirmed');
  });
  it('lost logout response retains a closed UI and a durable uncertain marker', async () => {
    const { promise, request } = await start(); request.flush(syntheticSession()); await promise;
    auth.logout(); await flushCoordination(); http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
    await flushCoordination(); expect(auth.logoutStatus()).toBe('uncertain'); expect(session.state()).toBe('blocked');
    expect(auth.sessionMessage()).toContain('não foi confirmada');
    await expect(firstValueFrom(auth.refresh())).rejects.toThrow(SessionOperationError); http.expectNone('/api/auth/refresh');
  });
  it('closes locally on a remote account change and suppresses its own old response', async () => {
    const { promise, request } = await start(); const old = promise.catch(error => error);
    const coordinator = new CookieSessionCoordinatorEngineForTest(harness.browser('B'));
    coordinator.announce('login'); await flushCoordination(); expect(session.state()).toBe('anonymous');
    request.flush(syntheticSession()); expect(await old).toBeInstanceOf(SessionOperationError); expect(auth.getToken()).toBeNull();
    coordinator.dispose();
  });
  it('rejects a serialized renewal with a different owner without account-switch replay', async () => {
    const { promise, request } = await start(); request.flush(syntheticSession()); await promise;
    const renewal = firstValueFrom(auth.refresh()).catch(error => error); await flushCoordination();
    const refresh = http.expectOne('/api/auth/refresh'); expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.get('X-CSRF-Protection')).toBe('1'); refresh.flush(syntheticSession(2));
    expect(await renewal).toBeInstanceOf(AuthContractError); expect(auth.currentUser()).toBeNull();
  });
  it('denies concurrent login submissions and does not let abandoned UI callbacks reopen state', async () => {
    const { promise, request } = await start(); const old = promise.catch(error => error);
    await expect(firstValueFrom(auth.login({ email: 'user2@example.com', password: 'password' }))).rejects.toThrow(SessionOperationError);
    auth.cancelPendingLogin(); request.flush(syntheticSession()); await old; expect(auth.getToken()).toBeNull();
  });
  it('keeps register/verify/resend public without creating a session', () => {
    auth = TestBed.inject(AuthService);
    auth.register({ firstName: 'Nome', lastName: 'Sobrenome', email: 'user@example.com', dateOfBirth: '1990-01-01', password: ' exact password ' }).subscribe();
    http.expectOne('/api/auth/register').flush({ ...syntheticSession().user, emailVerified: false }, { status: 201, statusText: 'Created' });
    auth.verifyEmail('opaque').subscribe(); http.expectOne('/api/auth/verify-email?token=opaque').flush(null, { status: 200, statusText: 'OK' });
    auth.resendVerification('user@example.com').subscribe(); http.expectOne('/api/auth/resend-verification').flush(null, { status: 200, statusText: 'OK' });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

import { CoordinationBrowser, CookieSessionCoordinatorEngine } from '../auth/session-coordinator';
class CookieSessionCoordinatorEngineForTest extends CookieSessionCoordinatorEngine {
  constructor(browser: CoordinationBrowser) { super(browser, '/api', document.baseURI); }
}
