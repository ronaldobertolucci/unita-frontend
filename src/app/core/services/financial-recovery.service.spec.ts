import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { FinancialRecoveryService } from './financial-recovery.service';
import { TransactionService } from './transaction.service';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { TransferService } from './transfer.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';
import { environment } from '../../../environments/environment';

describe('Financial recovery with the actual HTTP read services', () => {
  let service: FinancialRecoveryService;
  let backend: HttpTestingController;
  const base = environment.apiUrl;
  const ownPocket = { id: 10, type: 'BANK_ACCOUNT', label: 'Minha conta', balance: 20, active: true };
  const tx = { id: 101, amount: 80, direction: 'EXPENSE', transactionDate: '2026-10-13', description: 'Transferência familiar',
    category: { id: 2, name: 'Transferência Enviada', type: 'NEUTRAL', global: true }, operationType: 'TRANSFER', operationId: 5, canDelete: false };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const session = TestBed.inject(SessionService);
    session.accept(syntheticSession(), session.version());
    service = TestBed.inject(FinancialRecoveryService);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    try { backend.verify(); } finally { TestBed.resetTestingModule(); jest.useRealTimers(); }
  });

  const completePocketReview = () => {
    backend.expectOne(`${base}/pockets/my`).flush([ownPocket]);
    backend.expectOne(`${base}/pockets/10/balance`).flush(20);
    backend.expectOne(`${base}/pockets/10/transactions`).flush([tx]);
  };

  it('consults only owned pockets, preserves metadata and waits for explicit reconciliation', () => {
    service.mark({ label: 'Transferência de R$ 80', pocketIds: [10, 20] });
    service.confirm();
    expect(service.state()).toBe('pending');
    service.check();
    backend.expectOne(`${base}/pockets/my`).flush([ownPocket]);
    backend.expectOne(`${base}/pockets/10/balance`).flush(20);
    backend.expectOne(`${base}/pockets/10/transactions`).flush([tx]);
    backend.expectNone(`${base}/pockets/20/balance`);
    backend.expectNone(`${base}/pockets/20/transactions`);
    expect(service.state()).toBe('review');
    expect(service.pockets()[0].transactions[0]).toEqual(tx);
    service.confirm();
    expect(service.state()).toBe('clear');
  });

  it('keeps the block after a failed read and allows only a new read', () => {
    service.mark({ label: 'Saque FGTS', pocketIds: [10] });
    service.check();
    backend.expectOne(`${base}/pockets/my`).flush([ownPocket]);
    backend.expectOne(`${base}/pockets/10/balance`).flush(20);
    backend.expectOne(`${base}/pockets/10/transactions`).error(new ProgressEvent('error'));
    expect(service.state()).toBe('pending');
    service.confirm();
    expect(service.state()).toBe('pending');
    service.check();
    backend.expectOne(`${base}/pockets/my`).flush([ownPocket]);
    backend.expectOne(`${base}/pockets/10/balance`).flush(20);
    backend.expectOne(`${base}/pockets/10/transactions`).flush([tx]);
    expect(service.state()).toBe('review');
  });

  it('refreshes bill history and the payment account before offering reconciliation', () => {
    service.mark({ label: 'Pagamento de fatura', pocketIds: [10], cardId: 7, billId: 3 });
    service.check();
    backend.expectOne(`${base}/credit-cards/my`).flush([{ id: 7 }]);
    backend.expectOne(`${base}/pockets/my`).flush([ownPocket]);
    backend.expectOne(`${base}/pockets/10/balance`).flush(20);
    backend.expectOne(`${base}/pockets/10/transactions`).flush([{ ...tx, operationType: 'BILL_PAYMENT', operationId: 3 }]);
    backend.expectOne(`${base}/credit-cards/7/bills`).flush([{ id: 3, status: 'PAID', dueDate: '2026-10-13', totalAmount: 80 }]);
    backend.expectOne(`${base}/credit-cards/7/bills/3`).flush({ id: 3, status: 'PAID', dueDate: '2026-10-13', totalAmount: 80 });
    expect(service.bills()[0].status).toBe('PAID');
    expect(service.state()).toBe('review');
  });

  it('never replaces the statement of the pocket currently open on screen during reconciliation', () => {
    const transactions = TestBed.inject(TransactionService);
    transactions.loadTransactions(99).subscribe();
    backend.expectOne(`${base}/pockets/99/transactions`).flush([{ ...tx, id: 999 }]);
    service.mark({ label: 'Transferência', pocketIds: [10] });
    service.check();
    backend.expectOne(`${base}/pockets/my`).flush([ownPocket]);
    backend.expectOne(`${base}/pockets/10/balance`).flush(20);
    backend.expectOne(`${base}/pockets/10/transactions`).flush([tx]);
    expect(transactions.transactions().map(item => item.id)).toEqual([999]);
  });

  it('reads purchases, detail and bills before releasing an uncertain complete-plan correction', () => {
    service.mark({ label: 'Correção integral', pocketIds: [], cardId: 7, purchaseId: 50, reviewPurchases: true });
    service.check();
    backend.expectOne(`${base}/credit-cards/my`).flush([{ id: 7 }]);
    backend.expectOne(`${base}/pockets/my`).flush([]);
    backend.expectOne(`${base}/credit-cards/7/bills`).flush([{ id: 21, status: 'OPEN' }]);
    backend.expectOne(`${base}/credit-cards/7/purchases`).flush([{ id: 50, installments: [{ id: 101 }] }]);
    expect(service.state()).toBe('checking');
    backend.expectOne(`${base}/credit-cards/7/purchases/50`).flush({ id: 50, installments: [{ id: 202 }] });
    expect(service.state()).toBe('review');
    expect(service.purchases()[0].installments[0].id).toBe(202);
    service.confirm();
    expect(service.purchases()).toEqual([]);
    expect(service.state()).toBe('clear');
  });

  it('keeps an uncertain purchase blocked when purchase history cannot be consulted', () => {
    service.mark({ label: 'Criação integral', pocketIds: [], cardId: 7, reviewPurchases: true });
    service.check();
    backend.expectOne(`${base}/credit-cards/my`).flush([{ id: 7 }]);
    backend.expectOne(`${base}/pockets/my`).flush([]);
    backend.expectOne(`${base}/credit-cards/7/bills`).flush([]);
    backend.expectOne(`${base}/credit-cards/7/purchases`).error(new ProgressEvent('error'));
    service.confirm();
    expect(service.state()).toBe('pending');
    expect(service.purchases()).toEqual([]);
  });

  it('cancels reads and clears private review data when the user changes', () => {
    service.mark({ label: 'Transferência', pocketIds: [10] });
    service.check();
    const pending = backend.expectOne(`${base}/pockets/my`);
    TestBed.inject(SessionService).invalidate('logout');
    expect(pending.cancelled).toBe(true);
    expect(service.operation()).toBeNull();
    expect(service.pockets()).toEqual([]);
    expect(service.state()).toBe('clear');
  });

  it('preserves an interrupted write through token expiry and same-user renewal without replaying it', () => {
    jest.useFakeTimers();
    const session = TestBed.inject(SessionService);
    session.accept({ ...syntheticSession(), expiresIn: 2 }, session.version());
    const operation = { label: 'Transferência de R$ 80', pocketIds: [10] };
    const completed = jest.fn(), next = jest.fn();
    service.trackWrite(operation, TestBed.inject(TransferService).transfer({
      sourcePocketId: 10, targetPocketId: 20, amount: 80, description: 'Teste',
    })).subscribe({ next, complete: completed });
    const write = backend.expectOne(`${base}/transfers`);
    jest.advanceTimersByTime(2001);
    expect(write.cancelled).toBe(true); expect(completed).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled(); expect(service.operation()).toEqual(operation);
    expect(service.state()).toBe('pending');
    service.check(); service.confirm();
    expect(service.state()).toBe('pending'); backend.expectNone(`${base}/pockets/my`);
    session.accept(syntheticSession(), session.version());
    expect(service.state()).toBe('pending'); backend.expectNone(`${base}/transfers`);
    service.check(); completePocketReview();
    expect(service.state()).toBe('review'); expect(service.pockets()[0].transactions).toEqual([tx]);
    service.confirm(); expect(service.state()).toBe('clear'); backend.expectNone(`${base}/transfers`);
  });

  it('retains a lost-response operation across repeated expiry until the same user reviews it', () => {
    const session = TestBed.inject(SessionService);
    const operation = { label: 'Exclusão de lançamento', pocketIds: [10] };
    service.trackWrite(operation, TestBed.inject(TransactionService).deleteTransaction(10, 101))
      .subscribe({ error: () => {} });
    backend.expectOne(`${base}/pockets/10/transactions/101`).error(new ProgressEvent('error'));
    expect(service.state()).toBe('pending');
    session.invalidate('expired'); session.invalidate('expired');
    session.accept(syntheticSession(), session.version());
    expect(service.operation()).toEqual(operation); expect(service.state()).toBe('pending');
    service.confirm(); expect(service.state()).toBe('pending');
    backend.expectNone(`${base}/pockets/10/transactions/101`);
  });

  it.each(['checking', 'review'] as const)('expiry discards a %s consultation and requires fresh reads before confirmation', state => {
    const session = TestBed.inject(SessionService);
    const operation = { label: 'Transferência', pocketIds: [10] };
    service.mark(operation); service.check();
    const pending = state === 'checking' ? backend.expectOne(`${base}/pockets/my`) : null;
    if (state === 'review') completePocketReview();
    expect(service.state()).toBe(state);
    session.invalidate('expired');
    if (pending) expect(pending.cancelled).toBe(true);
    expect(service.state()).toBe('pending'); expect(service.operation()).toEqual(operation);
    expect(service.pockets()).toEqual([]);
    session.accept(syntheticSession(), session.version());
    service.confirm(); expect(service.state()).toBe('pending');
    service.check(); completePocketReview();
    expect(service.state()).toBe('review'); service.confirm(); expect(service.state()).toBe('clear');
  });

  it.each(['login', 'logout', 'remote', 'blocked', 'cancelled'] as const)('clears a pending operation on %s without leaking it to another account', reason => {
    const session = TestBed.inject(SessionService);
    service.mark({ label: 'Operação privada da conta A', pocketIds: [10] });
    session.invalidate('expired'); session.invalidate(reason);
    expect(service.operation()).toBeNull(); expect(service.state()).toBe('clear');
    if (reason !== 'blocked') session.accept(syntheticSession(2), session.version());
    service.check(); backend.expectNone(`${base}/pockets/my`);
  });

  it('rejects a renewed account different from the operation owner, even without a separate invalidation', () => {
    const session = TestBed.inject(SessionService);
    service.mark({ label: 'Operação privada da conta A', pocketIds: [10] });
    session.invalidate('expired'); session.accept(syntheticSession(2), session.version());
    expect(service.operation()).toBeNull(); expect(service.state()).toBe('clear');
    service.check(); backend.expectNone(`${base}/pockets/my`);
  });

  it('does not retry a write after an ambiguous server error', () => {
    const error = jest.fn();
    TestBed.inject(TransactionService).deleteTransaction(10, 101).subscribe({ error });
    backend.expectOne(`${base}/pockets/10/transactions/101`).flush({}, { status: 500, statusText: 'Error' });
    expect(error).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
    backend.expectNone(`${base}/pockets/10/transactions/101`);
  });

  it('requires investment position, history, account balance and statement before reconciling a lost buy response', () => {
    const operation = { label: 'Aporte', pocketIds: [10], assetId: 30 };
    service.mark(operation); service.check();
    completePocketReview();
    backend.expectOne(`${base}/assets/30`).flush({ id: 30, name: 'CDB', position: { currentValue: 180, totalInvested: 180 } });
    expect(service.state()).toBe('checking'); service.confirm(); expect(service.state()).toBe('checking');
    backend.expectOne(`${base}/assets/30/transactions`).flush([
      { id: 81, type: 'BUY', quantity: null, costBasis: null, relatedSellId: null, operationId: null, amount: 80, transactionDate: '2026-10-14', notes: null, pocketTransactionId: 101 },
    ]);
    expect(service.state()).toBe('review'); expect(service.investment()?.transactions[0].pocketTransactionId).toBe(101);
    expect(service.pockets()[0].transactions[0].id).toBe(101);
    TestBed.inject(SessionService).invalidate('expired');
    expect(service.investment()).toBeNull(); expect(service.operation()).toEqual(operation); expect(service.state()).toBe('pending');
    backend.expectNone(`${base}/assets/30/transactions/buy`);
  });

  it('keeps a yield blocked if investment history cannot be consulted', () => {
    service.mark({ label: 'Rendimento', pocketIds: [10], assetId: 30 }); service.check();
    completePocketReview();
    backend.expectOne(`${base}/assets/30`).flush({ id: 30 });
    backend.expectOne(`${base}/assets/30/transactions`).error(new ProgressEvent('error'));
    service.confirm();
    expect(service.state()).toBe('pending'); expect(service.investment()).toBeNull();
    backend.expectNone(`${base}/assets/30/transactions/yield`);
  });
  it('reads the refund list, statement and destination state before explicit reconciliation', () => {
    const refund = { id: 31, description: 'Devolução', amount: 50, refundDate: '2026-10-14', purchaseId: 81,
      category: { id: 2, name: 'Estornos', type: 'INCOME', global: false } };
    service.mark({ label: 'Estorno', pocketIds: [], cardId: 7, billId: 22, reviewRefunds: true });
    service.check();
    backend.expectOne(`${base}/credit-cards/my`).flush([{ id: 7 }]);
    backend.expectOne(`${base}/pockets/my`).flush([]);
    backend.expectOne(`${base}/credit-cards/7/bills`).flush([{ id: 22, status: 'OPEN', totalAmount: -40 }]);
    backend.expectOne(`${base}/credit-cards/7/bills/22`).flush({ id: 22, status: 'OPEN', totalAmount: -40 });
    backend.expectOne(`${base}/credit-cards/7/bills/22/refunds`).flush([refund]);
    expect(service.state()).toBe('checking');
    service.confirm();
    expect(service.state()).toBe('checking');
    backend.expectOne(`${base}/credit-cards/7/bills/22/installments`).flush({ installments: [], refunds: [refund] });
    expect(service.state()).toBe('review');
    expect(service.refunds()).toEqual([refund]);
    expect(service.refundStatement()?.refunds[0].purchaseId).toBe(81);
    expect(service.bills()[0].totalAmount).toBe(-40);
    service.confirm();
    expect(service.state()).toBe('clear');
    expect(service.refunds()).toEqual([]);
    expect(service.refundStatement()).toBeNull();
  });

  it('keeps an uncertain refund blocked when its statement cannot be consulted', () => {
    service.mark({ label: 'Estorno', pocketIds: [], cardId: 7, billId: 22, reviewRefunds: true });
    service.check();
    backend.expectOne(`${base}/credit-cards/my`).flush([{ id: 7 }]);
    backend.expectOne(`${base}/pockets/my`).flush([]);
    backend.expectOne(`${base}/credit-cards/7/bills`).flush([{ id: 22 }]);
    backend.expectOne(`${base}/credit-cards/7/bills/22`).flush({ id: 22 });
    backend.expectOne(`${base}/credit-cards/7/bills/22/refunds`).flush([]);
    backend.expectOne(`${base}/credit-cards/7/bills/22/installments`).error(new ProgressEvent('error'));
    service.confirm();
    expect(service.state()).toBe('pending');
    expect(service.refunds()).toEqual([]);
    expect(service.refundStatement()).toBeNull();
  });

});

describe('Financial recovery through actual authentication renewal', () => {
  it('keeps an expired in-flight transfer blocked after refresh until explicit reconciliation', async () => {
    const harness = coordinationHarness();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: COORDINATION_BROWSER, useValue: harness.browser('A') },
      { provide: Router, useValue: { url: '/transfers', navigate: jest.fn().mockResolvedValue(true) } },
    ] });
    const session = TestBed.inject(SessionService), auth = TestBed.inject(AuthService);
    const recovery = TestBed.inject(FinancialRecoveryService), backend = TestBed.inject(HttpTestingController);
    session.accept(syntheticSession(), session.version());
    try {
      recovery.trackWrite({ label: 'Transferência de R$ 80', pocketIds: [10] }, TestBed.inject(TransferService).transfer({
        sourcePocketId: 10, targetPocketId: 20, amount: 80, description: 'Teste',
      })).subscribe();
      const write = backend.expectOne('/api/transfers');
      expect(write.request.headers.get('Authorization')).toBe('Bearer synthetic-1');
      session.invalidate('expired');
      expect(write.cancelled).toBe(true); expect(recovery.state()).toBe('pending');
      const renewed = auth.ensureAuthenticated(); await flushCoordination();
      backend.expectOne('/api/auth/refresh').flush({ ...syntheticSession(), token: 'renewed' });
      expect(await renewed).toBe(true); expect(recovery.state()).toBe('pending');
      recovery.confirm(); expect(recovery.state()).toBe('pending');
      recovery.check();
      const pockets = backend.expectOne('/api/pockets/my');
      expect(pockets.request.headers.get('Authorization')).toBe('Bearer renewed');
      pockets.flush([{ id: 10, type: 'BANK_ACCOUNT', label: 'Minha conta', balance: 20, active: true }]);
      backend.expectOne('/api/pockets/10/balance').flush(20);
      backend.expectOne('/api/pockets/10/transactions').flush([{ id: 101, amount: 80, operationType: 'TRANSFER', operationId: 5 }]);
      expect(recovery.state()).toBe('review');
      recovery.confirm(); expect(recovery.state()).toBe('clear');
      backend.expectNone('/api/transfers'); backend.verify();
    } finally { TestBed.resetTestingModule(); }
  });
});
