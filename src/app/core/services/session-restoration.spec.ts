import { ApplicationInitStatus, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterOutlet, RouterStateSnapshot } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../app.config';
import { routes } from '../../app.routes';
import { authGuard } from '../guards/auth.guard';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { CookieSessionCoordinatorEngine } from '../auth/session-coordinator';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';

@Component({ selector: 'test-public-page', standalone: true, template: '<p>public-page</p>' }) class PublicPage {}
@Component({ selector: 'test-private-page', standalone: true, template: '<p>private-page</p>' }) class PrivatePage {}
@Component({ selector: 'test-private-layout', standalone: true, imports: [RouterOutlet], template: '<router-outlet />' }) class PrivateLayout {}

describe('H06 bootstrap, guards and session restoration', () => {
  let http: HttpTestingController, auth: AuthService, session: SessionService;
  let harness: ReturnType<typeof coordinationHarness>;
  function setup(marker?: 'blocked' | 'pending' | 'signed-out') {
    harness = coordinationHarness();
    if (marker) {
      const probe = new CookieSessionCoordinatorEngine(harness.browser('probe'), '/api', document.baseURI);
      harness.storage.set(probe.key, JSON.stringify({ protocol: 1, id: 'persisted', operation: 'logout', state: marker })); probe.dispose();
    }
    TestBed.configureTestingModule({ providers: [ ...appConfig.providers,
      provideHttpClientTesting(), { provide: COORDINATION_BROWSER, useValue: harness.browser('A') }
    ] });
    http = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthService); session = TestBed.inject(SessionService);
    // ROUTES is a multi-provider; replace the production lazy pages for this
    // integration while exercising its actual initializer and guard.
    TestBed.inject(Router).resetConfig([
      { path: 'login', component: PublicPage }, { path: 'register', component: PublicPage },
      { path: '', component: PrivateLayout, canActivate: [authGuard], canActivateChild: [authGuard], children: [
        { path: 'pockets/:id', component: PrivatePage }, { path: 'dashboard', component: PrivatePage }
      ] }
    ]);
  }
  afterEach(() => { try { http?.verify(); } finally { http = undefined!; TestBed.resetTestingModule(); jest.useRealTimers(); } });
  const guard = () => TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('bootstrap starts without blocking public pages; guards share one validated refresh', async () => {
    setup(); await flushCoordination();
    const first = auth.restoreSession(), second = guard();
    expect(session.state()).toBe('unknown'); await TestBed.inject(ApplicationInitStatus).donePromise;
    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.withCredentials).toBe(true); expect(refresh.request.headers.get('X-CSRF-Protection')).toBe('1');
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(syntheticSession()); expect(await first).toBe(true); expect(await second).toBe(true);
    expect(session.user()?.id).toBe(1); http.expectNone('/api/auth/me'); http.expectNone('/api/auth/refresh');
  });
  it('keeps public navigation usable while restoration waits and does not instantiate private pages early', async () => {
    setup(); const routerHarness = await RouterTestingHarness.create();
    await routerHarness.navigateByUrl('/register', PublicPage);
    expect(routerHarness.routeNativeElement?.textContent).toContain('public-page');
    const privateNavigation = routerHarness.navigateByUrl('/pockets/1', PrivateLayout);
    await flushCoordination(); expect(routerHarness.fixture.nativeElement.textContent).not.toContain('private-page');
    http.expectOne('/api/auth/refresh').flush(syntheticSession()); await privateNavigation; routerHarness.detectChanges();
    expect(routerHarness.fixture.nativeElement.textContent).toContain('private-page');
  });
  it('a cookie rejection redirects a deep link to login and does not repeat restoration', async () => {
    setup(); const page = await RouterTestingHarness.create(); const navigation = page.navigateByUrl('/pockets/1', PublicPage);
    await flushCoordination(); http.expectOne('/api/auth/refresh').flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await navigation; expect(TestBed.inject(Router).url).toBe('/login'); expect(session.state()).toBe('anonymous');
    expect(await auth.restoreSession()).toBe(false); http.expectNone('/api/auth/refresh');
  });
  it.each([0, 500])('restoration HTTP %s closes access and exposes recovery rather than wrong-password feedback', async status => {
    setup(); await flushCoordination(); const request = http.expectOne('/api/auth/refresh');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Error' });
    await flushCoordination(); expect(session.state()).toBe('blocked'); expect(auth.recoveryRequired()).toBe(true);
    expect(auth.sessionMessage()).not.toContain('senha inválidos'); expect(await auth.restoreSession()).toBe(false); http.expectNone('/api/auth/refresh');
  });
  it('malformed restoration cannot open access', async () => {
    setup(); await flushCoordination(); http.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), expiresIn: -1 });
    await flushCoordination(); expect(session.state()).toBe('blocked'); expect(auth.currentUser()).toBeNull();
  });
  it('restoration timeout releases waiting guards but blocks automatic retry', async () => {
    jest.useFakeTimers(); setup(); const decision = guard(); await flushCoordination();
    const request = http.expectOne('/api/auth/refresh'); jest.advanceTimersByTime(15001); await flushCoordination();
    expect(await decision).not.toBe(true); expect(request.cancelled).toBe(true); expect(session.state()).toBe('blocked');
    expect(await auth.restoreSession()).toBe(false); http.expectNone('/api/auth/refresh');
  });
  it.each(['blocked', 'pending'] as const)('reload respects persisted %s before dispatching any HTTP', async marker => {
    setup(marker); await flushCoordination(); expect(await auth.restoreSession()).toBe(false);
    expect(session.state()).toBe('blocked'); http.expectNone('/api/auth/refresh');
  });
  it('a known signed-out marker stays anonymous and permits explicit login', async () => {
    setup('signed-out'); await flushCoordination(); expect(await auth.restoreSession()).toBe(false);
    expect(session.state()).toBe('anonymous'); expect(auth.recoveryRequired()).toBe(false); http.expectNone('/api/auth/refresh');
    const login = new Promise<void>((resolve, reject) => auth.login({ email: 'user1@example.com', password: 'p' }).subscribe({ next: () => resolve(), error: reject }));
    await flushCoordination(); http.expectOne('/api/auth/login').flush(syntheticSession()); await login; expect(auth.isAuthenticated()).toBe(true);
  });
  it('logout while restoration is pending clears locally; the late refresh never restores it', async () => {
    setup(); await flushCoordination(); const refresh = http.expectOne('/api/auth/refresh');
    auth.logout(); expect(session.user()).toBeNull(); refresh.flush(syntheticSession()); await flushCoordination();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' }); await flushCoordination();
    expect(session.isAuthenticated()).toBe(false); expect(await auth.restoreSession()).toBe(false); http.expectNone('/api/auth/refresh');
  });
  it('navigation between private children rechecks expiry and restores only on demand', async () => {
    setup(); const page = await RouterTestingHarness.create();
    await flushCoordination(); http.expectOne('/api/auth/refresh').flush(syntheticSession()); await flushCoordination();
    await page.navigateByUrl('/pockets/1', PrivateLayout);
    session.invalidate('expired'); const navigation = page.navigateByUrl('/dashboard', PrivateLayout);
    await flushCoordination(); http.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'renewed' }); await navigation;
    expect(auth.getToken()).toBe('renewed');
  });
  it('the real route tree protects transitions between all private children', () => {
    expect(routes.find(route => route.canActivate?.includes(authGuard))?.canActivateChild).toContain(authGuard);
    expect(routes.filter(route => route.canActivate).length).toBe(1);
  });
});
