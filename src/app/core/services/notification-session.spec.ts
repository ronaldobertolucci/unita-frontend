import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NotificationService, INVITATION_SOURCE } from './notification.service';
import { SessionService } from './session.service';
import { COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';
import { StreamSource } from '../auth/invitation-stream';

describe('H12 notification lifecycle integrated with session', () => {
  let notifications: NotificationService, session: SessionService, http: HttpTestingController;
  let sources: Array<{ url: string; source: StreamSource; event: (data: unknown) => void; close: jest.Mock }>;
  beforeEach(() => {
    sources = [];
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: COORDINATION_BROWSER, useValue: coordinationHarness().browser('A') },
      { provide: INVITATION_SOURCE, useValue: (url: string) => {
        let listener: (event: Event) => void = () => {};
        const close = jest.fn();
        const source = { onopen: null, onerror: null, close,
          addEventListener: (_type: string, callback: (event: Event) => void) => { listener = callback; } } as unknown as StreamSource;
        sources.push({ url, source, close, event: data => listener({ data: JSON.stringify(data) } as MessageEvent) }); return source;
      } }
    ] });
    notifications = TestBed.inject(NotificationService); session = TestBed.inject(SessionService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); jest.useRealTimers(); } });
  it('waits for a valid session and reconnects automatically with the renewed token', async () => {
    notifications.connectSSE(); await flushCoordination(); expect(sources).toHaveLength(0);
    session.accept(syntheticSession(), session.version()); await flushCoordination(); expect(sources).toHaveLength(1);
    session.accept({ ...syntheticSession(), token: 'updated+/=' }, session.version()); expect(sources[0].close).toHaveBeenCalledTimes(1);
    await flushCoordination(); expect(sources).toHaveLength(2); expect(sources[1].url).toContain('token=updated%2B%2F%3D');
  });
  it('clears stream/toast/data synchronously and never applies an old source event', async () => {
    session.accept(syntheticSession(), session.version()); notifications.connectSSE(); await flushCoordination();
    const payload = { invitationId: 1, groupName: 'Synthetic', invitingUserFirstName: 'Nome', invitingUserLastName: 'Sobrenome' };
    sources[0].event(payload); http.expectOne('/api/invitations/my/pending').flush([{ id: 1 }]); expect(notifications.sseToast()).toEqual(payload);
    session.invalidate('logout'); expect(sources[0].close).toHaveBeenCalledTimes(1); expect(notifications.sseToast()).toBeNull(); expect(notifications.invitations()).toEqual([]);
    sources[0].event(payload); http.expectNone('/api/invitations/my/pending'); expect(notifications.sseToast()).toBeNull();
  });
  it('does not reset the retry budget on a duplicate connect call', async () => {
    session.accept(syntheticSession(), session.version()); notifications.connectSSE(); await flushCoordination();
    notifications.connectSSE(); await flushCoordination(); expect(sources).toHaveLength(1);
  });
  it('restarts after an expired context is renewed while layout is still mounted', async () => {
    session.accept(syntheticSession(), session.version()); notifications.connectSSE(); await flushCoordination();
    session.invalidate('expired'); expect(sources[0].close).toHaveBeenCalledTimes(1);
    session.accept({ ...syntheticSession(), token: 'renewed' }, session.version()); await flushCoordination(); expect(sources).toHaveLength(2);
  });
  it('does not open streams after the layout opted out and rejects malformed payloads', async () => {
    session.accept(syntheticSession(), session.version()); notifications.connectSSE(); await flushCoordination();
    sources[0].event({ invitationId: '1' }); expect(notifications.sseToast()).toBeNull(); http.expectNone('/api/invitations/my/pending');
    notifications.disconnectSSE(); session.accept({ ...syntheticSession(), token: 'next' }, session.version()); await flushCoordination(); expect(sources).toHaveLength(1);
  });
  it('blocks duplicate responses to an invitation and does not display raw server text', () => {
    notifications.respondToInvitation(1, true); notifications.respondToInvitation(1, true);
    http.expectOne('/api/invitations/1/respond').flush({ message: 'internal financial details' }, { status: 500, statusText: 'Error' });
    expect(notifications.respondError()).not.toContain('internal financial details');
  });
  it('times out finite REST without closing a healthy stream', async () => {
    jest.useFakeTimers(); session.accept(syntheticSession(), session.version()); notifications.connectSSE(); await flushCoordination();
    notifications.loadInvitations(); const request = http.expectOne('/api/invitations/my/pending'); jest.advanceTimersByTime(15001);
    expect(request.cancelled).toBe(true); expect(sources[0].close).not.toHaveBeenCalled(); expect(notifications.loading()).toBe(false);
  });
  it('reconciles a notice arriving during an older REST load without parallel requests', async () => {
    session.accept(syntheticSession(), session.version()); notifications.connectSSE(); await flushCoordination();
    notifications.loadInvitations(); const old = http.expectOne('/api/invitations/my/pending');
    const notice = { invitationId: 1, groupName: 'Synthetic', invitingUserFirstName: 'Nome', invitingUserLastName: 'Sobrenome' };
    sources[0].event(notice); sources[0].event(notice); http.expectNone('/api/invitations/my/pending');
    old.flush([]); http.expectOne('/api/invitations/my/pending').flush([{ id: 1 }]);
    expect(notifications.invitations()).toEqual([{ id: 1 }]); expect(notifications.loading()).toBe(false);
  });
});
