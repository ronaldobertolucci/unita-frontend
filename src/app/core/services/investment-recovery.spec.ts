import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssetService } from './asset.service';
import { FinancialRecoveryService } from './financial-recovery.service';
import { SessionService } from './session.service';
import { syntheticSession } from '../testing/session.mock';
import { investmentBaseline } from '../testing/investment-baseline.fixture';
import { environment } from '../../../environments/environment';

describe('INV-001 investment recovery with real HTTP services', () => {
  let http: HttpTestingController;
  let assets: AssetService;
  let recovery: FinancialRecoveryService;
  let session: SessionService;
  let data: ReturnType<typeof investmentBaseline>;
  const base = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    assets = TestBed.inject(AssetService);
    recovery = TestBed.inject(FinancialRecoveryService);
    session = TestBed.inject(SessionService);
    session.accept(syntheticSession(91001), session.version());
    data = investmentBaseline();
  });

  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); }
  });

  function startWrite() {
    return recovery.trackWrite({ label: 'Resgate integral S01', pocketIds: [data.pocket.id], assetId: data.redeemed.id },
      assets.sell(data.redeemed.id, data.sell)).subscribe({ error: () => {} });
  }

  function readInvestment() {
    http.expectOne(`${base}/assets/${data.redeemed.id}`).flush(data.redeemed);
    http.expectOne(`${base}/assets/${data.redeemed.id}/transactions`).flush(data.redemptionTransactions);
  }

  function readCash() {
    http.expectOne(`${base}/pockets/my`).flush([data.pocket]);
    http.expectOne(`${base}/pockets/${data.pocket.id}/balance`).flush(data.pocket.balance);
    http.expectOne(`${base}/pockets/${data.pocket.id}/transactions`).flush(data.cashTransactions);
  }

  it.each([0, 500, 503])('consults the investment, original movements and net cash after HTTP %s without replay', status => {
    startWrite();
    const write = http.expectOne(`${base}/assets/${data.redeemed.id}/transactions/sell`);
    if (status === 0) write.error(new ProgressEvent('error'));
    else write.flush({}, { status, statusText: 'Uncertain result' });
    expect(recovery.state()).toBe('pending');
    recovery.confirm();
    expect(recovery.state()).toBe('pending');
    recovery.check();
    readInvestment();
    expect(recovery.state()).toBe('checking');
    readCash();
    expect(recovery.state()).toBe('review');
    expect(recovery.investment()).toEqual({ asset: data.redeemed, transactions: data.redemptionTransactions });
    // The original SELL is gross 1100; the cash already contains withholding (1085).
    expect(recovery.pockets()).toEqual([{ id: data.pocket.id, label: data.pocket.label,
      balance: data.pocket.balance, transactions: data.cashTransactions }]);
    recovery.confirm();
    expect(recovery.state()).toBe('clear');
    expect(recovery.operation()).toBeNull();
    expect(recovery.investment()).toBeNull();
    expect(recovery.pockets()).toEqual([]);
    http.expectNone(request => request.method !== 'GET');
  });

  it('keeps reconciliation pending when investment history is unavailable and permits a new read', () => {
    recovery.mark({ label: 'Resgate integral S01', pocketIds: [data.pocket.id], assetId: data.redeemed.id });
    recovery.check();
    readCash();
    http.expectOne(`${base}/assets/${data.redeemed.id}`).flush(data.redeemed);
    http.expectOne(`${base}/assets/${data.redeemed.id}/transactions`).flush({}, { status: 500, statusText: 'Unavailable' });
    recovery.confirm();
    expect(recovery.state()).toBe('pending');
    expect(recovery.investment()).toBeNull();
    expect(recovery.pockets()).toEqual([]);
    recovery.check(); readCash(); readInvestment();
    expect(recovery.state()).toBe('review');
    http.expectNone(request => request.method !== 'GET');
  });

  it('consults after navigation cancels a sell response, without issuing another sell', () => {
    const subscription = startWrite();
    const write = http.expectOne(`${base}/assets/${data.redeemed.id}/transactions/sell`);
    subscription.unsubscribe();
    expect(write.cancelled).toBe(true);
    expect(recovery.state()).toBe('checking');
    readInvestment(); readCash();
    expect(recovery.state()).toBe('review');
    http.expectNone(request => request.method !== 'GET');
  });

  it('preserves the intention through same-owner renewal and requires fresh reads', () => {
    startWrite();
    const write = http.expectOne(`${base}/assets/${data.redeemed.id}/transactions/sell`);
    session.invalidate('expired');
    expect(write.cancelled).toBe(true);
    expect(recovery.state()).toBe('pending');
    recovery.check();
    http.expectNone(request => true);
    session.accept(syntheticSession(91001), session.version());
    recovery.confirm();
    expect(recovery.state()).toBe('pending');
    recovery.check(); readInvestment(); readCash();
    expect(recovery.state()).toBe('review');
    http.expectNone(request => request.method !== 'GET');
  });

  it.each(['sending', 'checking', 'review'] as const)('clears investment data on account change during %s', state => {
    startWrite();
    const write = http.expectOne(`${base}/assets/${data.redeemed.id}/transactions/sell`);
    if (state !== 'sending') {
      write.error(new ProgressEvent('error'));
      recovery.check();
    }
    const reads = state === 'checking' ? http.match(request => request.method === 'GET') : [];
    if (state === 'review') { readInvestment(); readCash(); }
    expect(recovery.state()).toBe(state);
    session.invalidate('login', 'unknown');
    session.accept(syntheticSession(91002), session.version());
    if (state === 'sending') expect(write.cancelled).toBe(true);
    for (const request of reads) expect(request.cancelled).toBe(true);
    expect(recovery.state()).toBe('clear');
    expect(recovery.operation()).toBeNull();
    expect(recovery.investment()).toBeNull();
    expect(recovery.pockets()).toEqual([]);
    recovery.check(); recovery.confirm();
    http.expectNone(request => true);
  });
});
