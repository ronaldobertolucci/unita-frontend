import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FinancialRecoveryService } from './financial-recovery.service';
import { TransactionService } from './transaction.service';
import { SessionService } from './session.service';
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
  afterEach(() => backend.verify());

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

  it('does not retry a write after an ambiguous server error', () => {
    const error = jest.fn();
    TestBed.inject(TransactionService).deleteTransaction(10, 101).subscribe({ error });
    backend.expectOne(`${base}/pockets/10/transactions/101`).flush({}, { status: 500, statusText: 'Error' });
    expect(error).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
    backend.expectNone(`${base}/pockets/10/transactions/101`);
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
