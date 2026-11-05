import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FinancialRecoveryService } from './financial-recovery.service';
import { SessionService } from './session.service';
import { syntheticSession } from '../testing/session.mock';
import { investmentBaseline } from '../testing/investment-baseline.fixture';
import { environment } from '../../../environments/environment';

// Real Angular HTTP services; backend idempotency is additionally tested in PostgreSQL.
describe('persisted investment sale recovery', () => {
  let recovery: FinancialRecoveryService;
  let session: SessionService;
  let http: HttpTestingController;
  const base = environment.apiUrl;
  const key = 'unita.pending-investment-sale.v1';
  const data = investmentBaseline();
  const assetId = data.fixedIncome.id;
  const path = `${base}/assets/${assetId}/transactions/sell`;
  const payload = { ...data.sell, quantity: 1, notes: ' Exact notes ' };
  const movement = { ...data.redemptionTransactions[1], operationId: payload.operationId, quantity: 1, costBasis: 1000 };

  function boot(owner = 91001) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(SessionService);
    session.accept(syntheticSession(owner), session.version());
    recovery = TestBed.inject(FinancialRecoveryService);
    http = TestBed.inject(HttpTestingController);
  }
  beforeEach(() => { sessionStorage.clear(); boot(); });
  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); sessionStorage.clear(); }
  });

  function send() { return recovery.sell(assetId, payload).subscribe({ error: () => {} }); }
  function unknown() { send(); http.expectOne(path).error(new ProgressEvent('error')); }
  function reads(confirmed: boolean, redeemed = false) {
    http.expectOne(`${base}/assets/${assetId}`).flush({ ...data.fixedIncome, status: redeemed ? 'REDEEMED' : 'ACTIVE' });
    http.expectOne(`${base}/assets/${assetId}/transactions`).flush(confirmed ? [movement] : []);
    http.expectOne(`${base}/assets`).flush(data.summaries);
    http.expectOne(`${base}/pockets/my`).flush([data.pocket]);
    http.expectOne(`${base}/pockets/${data.pocket.id}/balance`).flush(1085);
    http.expectOne(`${base}/pockets/${data.pocket.id}/transactions`).flush(data.cashTransactions);
  }

  it('stores before HTTP, blocks a double click and retries the exact command even after form mutation', () => {
    const input = { ...payload };
    recovery.sell(assetId, input).subscribe({ error: () => {} });
    expect(JSON.parse(sessionStorage.getItem(key)!).operation.sale.payload).toEqual(payload);
    send();
    input.quantity = 2; input.notes = 'Changed';
    http.expectOne(path).error(new ProgressEvent('error'));
    recovery.check(); reads(false);
    recovery.confirm(); expect(recovery.state()).toBe('review');
    recovery.retrySale(); recovery.retrySale();
    const retry = http.expectOne(path);
    expect(retry.request.body).toEqual(payload);
    retry.flush([movement]); reads(true);
    recovery.confirm();
    expect(recovery.state()).toBe('clear');
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it.each([false, true])('recognizes UUID confirmation when redeemed=%s without another sale', redeemed => {
    unknown(); recovery.check(); reads(true, redeemed);
    expect(recovery.operation()?.sale?.confirmed).toBe(true);
    recovery.confirm(); expect(recovery.state()).toBe('clear');
    http.expectNone(path);
  });

  it('does not treat a different sale UUID or ACTIVE as failure or confirmation', () => {
    unknown();
    recovery.resolveSaleHistory(assetId, [{ ...movement, operationId: 'e627f953-ffbd-4e4b-92c3-333ce72f22d5' }]);
    recovery.check(); reads(false);
    recovery.confirm();
    expect(recovery.operation()?.sale?.confirmed).toBe(false);
    expect(recovery.state()).toBe('review');
  });

  it('only refreshes reads after a successful write with failed list refresh', () => {
    send(); http.expectOne(path).flush([movement]);
    recovery.check();
    const pending = http.match(request => request.method === 'GET');
    pending.find(request => request.request.url === `${base}/assets`)!.flush({}, { status: 500, statusText: 'Unavailable' });
    expect(recovery.state()).toBe('pending');
    expect(recovery.operation()?.sale?.confirmed).toBe(true);
    recovery.retrySale(); reads(true);
    http.expectNone(path);
    recovery.confirm(); expect(recovery.state()).toBe('clear');
  });

  it('keeps an uncertain operation on conflicting retry and does not let manual confirmation erase it', () => {
    unknown(); recovery.retrySale();
    http.expectOne(path).flush({}, { status: 409, statusText: 'Conflict' });
    reads(false);
    recovery.confirm();
    expect(recovery.operation()?.sale?.payload).toEqual(payload);
    expect(recovery.operation()?.message).toContain('Conflito');
    expect(recovery.state()).toBe('review');
  });

  it.each([400, 409])('allows correction after a definitive first rejection %s', status => {
    send(); http.expectOne(path).flush({}, { status, statusText: 'Rejected' });
    expect(recovery.state()).toBe('clear');
    expect(sessionStorage.getItem(key)).toBeNull();
    const corrected = { ...payload, quantity: 2, operationId: 'e627f953-ffbd-4e4b-92c3-333ce72f22d5' };
    recovery.sell(assetId, corrected).subscribe({ error: () => {} });
    const next = http.expectOne(path); expect(next.request.body).toEqual(corrected);
    next.flush({}, { status: 400, statusText: 'Rejected' });
  });

  it('preserves a cancelled write through navigation and a full service reload for the same owner', () => {
    const subscription = send(); const write = http.expectOne(path);
    subscription.unsubscribe(); expect(write.cancelled).toBe(true);
    expect(recovery.state()).toBe('pending');
    TestBed.resetTestingModule(); boot();
    expect(recovery.operation()?.sale?.payload).toEqual(payload);
    recovery.retrySale();
    const retry = http.expectOne(path); expect(retry.request.body).toEqual(payload);
    retry.flush([movement]); reads(true);
  });

  it('retains the UUID during expiry and renewal by the same owner', () => {
    send(); const request = http.expectOne(path);
    session.invalidate('expired'); expect(request.cancelled).toBe(true);
    session.accept(syntheticSession(91001), session.version());
    recovery.retrySale();
    const retry = http.expectOne(path); expect(retry.request.body).toEqual(payload);
    retry.flush([movement]); reads(true);
  });

  it.each(['logout', 'login'] as const)('removes all stored context on %s', reason => {
    unknown(); session.invalidate(reason);
    session.accept(syntheticSession(91002), session.version());
    expect(recovery.operation()).toBeNull(); expect(sessionStorage.getItem(key)).toBeNull();
    recovery.retrySale(); http.expectNone(path);
  });

  it('does not restore another owner after reload', () => {
    unknown(); TestBed.resetTestingModule(); boot(91002);
    expect(recovery.operation()).toBeNull(); expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('clears persisted sale on logout even if recovery has not been instantiated after reload', () => {
    unknown(); TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(SessionService);
    session.accept(syntheticSession(91001), session.version());
    session.invalidate('logout');
    expect(sessionStorage.getItem(key)).toBeNull();
    http = TestBed.inject(HttpTestingController);
  });

  it('fails before HTTP if the command cannot be stored', () => {
    const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    try { send(); http.expectNone(path); expect(recovery.state()).toBe('clear'); }
    finally { storage.mockRestore(); }
  });
});
