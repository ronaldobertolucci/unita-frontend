import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TransactionService } from './transaction.service';
import { TransactionDto } from '../models/transaction.model';
import { environment } from '../../../environments/environment';

const base = environment.apiUrl;
const pocketId = 1;

const mockTransaction: TransactionDto = {
  id: 1,
  amount: 100,
  direction: 'EXPENSE',
  transactionDate: '2025-01-15',
  description: 'Conta de luz',
  category: { id: 1, name: 'Moradia', type: 'EXPENSE', isSystem: false },
};

const mockTransaction2: TransactionDto = {
  id: 2,
  amount: 500,
  direction: 'INCOME',
  transactionDate: '2025-01-10',
  description: 'Salário',
  category: { id: 9, name: 'Salário', type: 'INCOME', isSystem: false },
};

describe('TransactionService', () => {
  let service: TransactionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TransactionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TransactionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty transactions', () => {
      expect(service.transactions()).toEqual([]);
    });
  });

  // ─── loadTransactions() ───────────────────────────────────────────────────

  describe('loadTransactions()', () => {
    it('should GET transactions and set signal', () => {
      service.loadTransactions(pocketId).subscribe();
      http.expectOne(`${base}/pockets/${pocketId}/transactions`).flush([mockTransaction, mockTransaction2]);
      expect(service.transactions()).toEqual([mockTransaction, mockTransaction2]);
    });

    it('should append startDate query param when provided', () => {
      service.loadTransactions(pocketId, '2025-01-01').subscribe();
      const req = http.expectOne(r => r.url === `${base}/pockets/${pocketId}/transactions`);
      expect(req.request.params.get('startDate')).toBe('2025-01-01');
      expect(req.request.params.has('endDate')).toBe(false);
      req.flush([]);
    });

    it('should append endDate query param when provided', () => {
      service.loadTransactions(pocketId, undefined, '2025-01-31').subscribe();
      const req = http.expectOne(r => r.url === `${base}/pockets/${pocketId}/transactions`);
      expect(req.request.params.has('startDate')).toBe(false);
      expect(req.request.params.get('endDate')).toBe('2025-01-31');
      req.flush([]);
    });

    it('should append both date params when provided', () => {
      service.loadTransactions(pocketId, '2025-01-01', '2025-01-31').subscribe();
      const req = http.expectOne(r => r.url === `${base}/pockets/${pocketId}/transactions`);
      expect(req.request.params.get('startDate')).toBe('2025-01-01');
      expect(req.request.params.get('endDate')).toBe('2025-01-31');
      req.flush([]);
    });
  });

  // ─── createTransaction() ──────────────────────────────────────────────────

  describe('createTransaction()', () => {
    it('should POST to the correct endpoint', () => {
      const payload = {
        amount: 100,
        direction: 'EXPENSE' as const,
        transactionDate: '2025-01-15',
        description: 'Conta de luz',
        categoryId: 1,
      };

      let result: TransactionDto | undefined;
      service.createTransaction(pocketId, payload).subscribe(r => (result = r));

      const req = http.expectOne(`${base}/pockets/${pocketId}/transactions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(mockTransaction);

      expect(result).toEqual(mockTransaction);
    });

    it('should not update the transactions signal on create', () => {
      service['_transactions'].set([mockTransaction2]);
      service.createTransaction(pocketId, {
        amount: 100, direction: 'EXPENSE', transactionDate: '2025-01-15',
        description: 'Teste', categoryId: 1,
      }).subscribe();
      http.expectOne(`${base}/pockets/${pocketId}/transactions`).flush(mockTransaction);
      // signal não é atualizado — loadTransactions é chamado pelo componente após o create
      expect(service.transactions()).toEqual([mockTransaction2]);
    });
  });

  // ─── deleteTransaction() ──────────────────────────────────────────────────

  describe('deleteTransaction()', () => {
    it('should DELETE to the correct endpoint', () => {
      service.deleteTransaction(pocketId, 1).subscribe();
      const req = http.expectOne(`${base}/pockets/${pocketId}/transactions/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('should remove the transaction from the signal locally', () => {
      service['_transactions'].set([mockTransaction, mockTransaction2]);
      service.deleteTransaction(pocketId, mockTransaction.id).subscribe();
      http.expectOne(`${base}/pockets/${pocketId}/transactions/${mockTransaction.id}`).flush(null);
      expect(service.transactions().find(t => t.id === mockTransaction.id)).toBeUndefined();
      expect(service.transactions().length).toBe(1);
    });
  });

  // ─── clearTransactions() ──────────────────────────────────────────────────

  describe('clearTransactions()', () => {
    it('should reset the transactions signal to empty', () => {
      service['_transactions'].set([mockTransaction, mockTransaction2]);
      service.clearTransactions();
      expect(service.transactions()).toEqual([]);
    });
  });
});