import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';
import { AuthContractError } from '../auth/auth-contract';

describe('H09–H11 public authentication contracts', () => {
  let auth: AuthService, session: SessionService, http: HttpTestingController;
  const registration = { firstName: 'Nome', lastName: 'Sobrenome', email: 'test@example.com', dateOfBirth: '1990-01-01', password: ' exact password ' };
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: Router, useValue: { url: '/reset-password', navigate: jest.fn() } },
      { provide: COORDINATION_BROWSER, useValue: coordinationHarness().browser('A') }
    ] });
    auth = TestBed.inject(AuthService); session = TestBed.inject(SessionService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); jest.useRealTimers(); });
  it('posts selected registration fields, requires 201 and never saves a session', async () => {
    const response = firstValueFrom(auth.register({ ...registration, confirmPassword: 'omit' } as typeof registration));
    const request = http.expectOne('/api/auth/register'); expect(request.request.body).toEqual(registration);
    request.flush({ ...syntheticSession().user, emailVerified: false, privateExtra: 'discard' }, { status: 201, statusText: 'Created' });
    expect(await response).not.toHaveProperty('privateExtra'); expect(session.state()).toBe('unknown');
  });
  it.each([
    [200, { ...syntheticSession().user, emailVerified: false }],
    [201, syntheticSession().user], [201, { ...syntheticSession().user, enabled: false, emailVerified: false }],
    [201, { id: 1 }]
  ])('rejects invalid registration success status/DTO %s', async (status, user) => {
    const result = firstValueFrom(auth.register(registration)).catch(error => error);
    http.expectOne('/api/auth/register').flush(user, { status: status as number, statusText: 'Success' });
    expect(await result).toBeInstanceOf(AuthContractError); expect(auth.isAuthenticated()).toBe(false);
  });
  it.each(['verify', 'resend'] as const)('accepts exactly empty 200 for %s without auth headers/session change', async kind => {
    session.accept(syntheticSession(), session.version());
    const result = firstValueFrom(kind === 'verify' ? auth.verifyEmail('opaque+/=') : auth.resendVerification('test@example.com'));
    const request = http.expectOne(req => req.url.includes(kind === 'verify' ? '/verify-email' : '/resend-verification'));
    expect(request.request.headers.has('Authorization')).toBe(false); expect(request.request.withCredentials).toBe(false);
    if (kind === 'verify') expect(request.request.params.get('token')).toBe('opaque+/=');
    request.flush(null, { status: 200, statusText: 'OK' }); await result; expect(session.user()?.id).toBe(1); http.expectNone('/api/auth/refresh');
  });
  it.each(['verify', 'resend'] as const)('rejects nonempty/mis-status success for %s', async kind => {
    const result = firstValueFrom(kind === 'verify' ? auth.verifyEmail('token') : auth.resendVerification('test@example.com')).catch(error => error);
    http.expectOne(req => req.url.includes(kind === 'verify' ? '/verify-email' : '/resend-verification')).flush('unexpected');
    expect(await result).toBeInstanceOf(AuthContractError);
  });
  it.each(['forgot', 'validate', 'reset'] as const)('requires a message DTO for %s success', async kind => {
    const request$ = kind === 'forgot' ? auth.forgotPassword('test@example.com') : kind === 'validate' ? auth.validateResetToken('token') : auth.resetPassword({ token: 'token', newPassword: ' exact password ' });
    const result = firstValueFrom(request$).catch(error => error);
    http.expectOne(req => req.url.startsWith('/api/password/')).flush({});
    expect(await result).toBeInstanceOf(AuthContractError); expect(session.state()).toBe('unknown');
  });
  it('owns an initiated reset after screen unsubscribe and still invalidates private state on valid 200', async () => {
    session.accept(syntheticSession(), session.version()); const cleanup = jest.fn();
    session.registerCleanup(cleanup, TestBed.inject(DestroyRef));
    const subscription = auth.resetPassword({ token: 'token', newPassword: ' exact password ' }).subscribe();
    const request = http.expectOne('/api/password/reset'); subscription.unsubscribe();
    expect(request.cancelled).toBe(false); expect(request.request.body).toEqual({ token: 'token', newPassword: ' exact password ' });
    request.flush({ message: 'Password has been reset successfully' }); await flushCoordination();
    expect(session.user()).toBeNull(); expect(cleanup).toHaveBeenCalledTimes(1); http.expectNone('/api/auth/logout');
  });
  it('public finite calls time out without a retry', async () => {
    jest.useFakeTimers(); const result = firstValueFrom(auth.forgotPassword('test@example.com')).catch(error => error);
    const request = http.expectOne('/api/password/forgot'); jest.advanceTimersByTime(15001);
    expect((await result).name).toBe('TimeoutError'); expect(request.cancelled).toBe(true); http.expectNone('/api/password/forgot');
  });
});
