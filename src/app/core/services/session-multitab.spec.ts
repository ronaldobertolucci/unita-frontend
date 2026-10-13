import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { CookieSessionCoordinator, COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';

describe('H06/H07 integrated runtimes sharing the cookie coordination boundary', () => {
  let harness: ReturnType<typeof coordinationHarness>;
  let tabs: EnvironmentInjector[];
  function tab(owner: string) {
    const injector = createEnvironmentInjector([
      AuthService, SessionService, CookieSessionCoordinator,
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: COORDINATION_BROWSER, useValue: harness.browser(owner) },
      { provide: Router, useValue: { url: '/dashboard', navigate: jest.fn().mockResolvedValue(true) } }
    ], TestBed.inject(EnvironmentInjector));
    tabs.push(injector);
    return { auth: injector.get(AuthService), session: injector.get(SessionService),
      http: injector.get(HttpClient), backend: injector.get(HttpTestingController) };
  }
  beforeEach(() => { harness = coordinationHarness(); tabs = []; });
  afterEach(() => {
    try { for (const injector of tabs) injector.get(HttpTestingController).verify(); }
    finally { for (const injector of tabs) injector.destroy(); TestBed.resetTestingModule(); }
  });
  it('two restoration attempts execute sequentially and accept their own JWT without broadcasting it', async () => {
    const a = tab('A'), b = tab('B'); const restoreA = a.auth.restoreSession(), restoreB = b.auth.restoreSession();
    await flushCoordination(); const first = a.backend.expectOne('/api/auth/refresh'); b.backend.expectNone('/api/auth/refresh');
    first.flush({ ...syntheticSession(), token: 'rotation-1' }); await flushCoordination();
    b.backend.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'rotation-2' });
    expect(await restoreA).toBe(true); expect(await restoreB).toBe(true);
    expect(a.auth.getToken()).toBe('rotation-1'); expect(b.auth.getToken()).toBe('rotation-2');
    expect(JSON.stringify([...harness.storage.values()])).not.toContain('rotation-');
  });
  it('remote logout invalidates an in-flight recovery and prevents replay before its remote POST settles', async () => {
    const a = tab('A'), b = tab('B');
    for (const client of [a, b]) client.session.accept(syntheticSession(), client.session.version());
    const next = jest.fn(); a.http.post('/api/transfers', { amount: 10 }).subscribe({ next, error: () => {} });
    a.backend.expectOne('/api/transfers').flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await flushCoordination(); const refresh = a.backend.expectOne('/api/auth/refresh'); b.auth.logout(); await flushCoordination();
    expect(a.session.user()).toBeNull(); expect(b.session.user()).toBeNull(); b.backend.expectNone('/api/auth/logout');
    refresh.flush({ ...syntheticSession(), token: 'too-late' }); await flushCoordination();
    b.backend.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' }); await flushCoordination();
    a.backend.expectNone('/api/transfers'); expect(next).not.toHaveBeenCalled(); expect(a.auth.isAuthenticated()).toBe(false);
  });
  it('uncertainty in one tab blocks the other queued restoration without a second rotation', async () => {
    const a = tab('A'), b = tab('B'); const restoreA = a.auth.restoreSession(), restoreB = b.auth.restoreSession();
    await flushCoordination(); a.backend.expectOne('/api/auth/refresh').error(new ProgressEvent('error'));
    expect(await restoreA).toBe(false); expect(await restoreB).toBe(false);
    b.backend.expectNone('/api/auth/refresh'); expect(b.session.state()).toBe('blocked');
  });
  it('a successful password reset clears both runtimes and prevents late refresh from restoring either', async () => {
    const a = tab('A'), b = tab('B');
    for (const client of [a, b]) client.session.accept(syntheticSession(), client.session.version());
    const renewal = b.auth.refresh().subscribe({ error: () => {} }); await flushCoordination();
    const refresh = b.backend.expectOne('/api/auth/refresh');
    a.auth.resetPassword({ token: 'synthetic-reset-token', newPassword: ' synthetic password ' }).subscribe();
    a.backend.expectOne('/api/password/reset').flush({ message: 'Password has been reset successfully' }); await flushCoordination();
    expect(a.session.user()).toBeNull(); expect(b.session.user()).toBeNull();
    refresh.flush(syntheticSession()); await flushCoordination(); expect(b.session.isAuthenticated()).toBe(false);
    a.backend.expectNone('/api/auth/logout'); b.backend.expectNone('/api/auth/logout'); renewal.unsubscribe();
  });
});
