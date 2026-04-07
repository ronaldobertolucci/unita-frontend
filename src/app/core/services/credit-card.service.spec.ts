import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreditCardService } from './credit-card.service';
import {
  CreditCardDto,
  CreditCardBillDto,
  CreditCardPurchaseDto,
  CreditCardInstallmentDto,
  CreditCardRefundDto,
  BillStatementDto,
} from '../models/credit-card.model';
import { environment } from '../../../environments/environment';

const base = environment.apiUrl;

const mockCard: CreditCardDto = {
  id: 1,
  legalEntityCorporateName: 'Banco X',
  lastFourDigits: '1234',
  cardBrand: 'Visa',
  creditLimit: 5000,
  closingDay: 15,
  dueDay: 22,
};

const mockCard2: CreditCardDto = {
  id: 2,
  legalEntityCorporateName: 'Banco Y',
  lastFourDigits: '5678',
  cardBrand: 'Mastercard',
  creditLimit: 3000,
  closingDay: 10,
  dueDay: 20,
};

const mockBill: CreditCardBillDto = {
  id: 10,
  closingDate: '2025-03-15',
  dueDate: '2025-03-22',
  status: 'OPEN',
  totalInstallments: 500,
  totalRefunds: 0,
  totalAmount: 500,
};

const mockPurchase: CreditCardPurchaseDto = {
  id: 100,
  description: 'Geladeira',
  totalValue: 300,
  purchaseDate: '2025-03-01',
  installmentsCount: 3,
};

const mockInstallment: CreditCardInstallmentDto = {
  id: 200,
  installmentNumber: 1,
  amount: 100,
  creditCardBillId: 10,
  billDueDate: '2025-03-22',
  category: { id: 1, name: 'Alimentação', type: 'EXPENSE', isSystem: false },
};

const mockRefund: CreditCardRefundDto = {
  id: 300,
  description: 'Estorno X',
  amount: 50,
  refundDate: '2025-03-10',
  category: { id: 1, name: 'Alimentação', type: 'EXPENSE', isSystem: false },
};

const mockStatement: BillStatementDto = {
  installments: [
    {
      id: 200,
      description: 'Geladeira',
      amount: 100,
      purchaseDate: '2025-03-01',
      installmentNumber: 1,
      totalInstallments: 3,
      category: { id: 1, name: 'Alimentação', type: 'EXPENSE', isSystem: false },
    },
  ],
  refunds: [],
};

describe('CreditCardService', () => {
  let service: CreditCardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CreditCardService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CreditCardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty creditCards signal', () => {
      expect(service.creditCards()).toEqual([]);
    });
  });

  // ─── loadCreditCards() ────────────────────────────────────────────────────

  describe('loadCreditCards()', () => {
    it('should GET /credit-cards/my and set signal', () => {
      service.loadCreditCards().subscribe();
      http.expectOne(`${base}/credit-cards/my`).flush([mockCard, mockCard2]);
      expect(service.creditCards()).toEqual([mockCard, mockCard2]);
    });
  });

  // ─── getCreditCard() ──────────────────────────────────────────────────────

  describe('getCreditCard()', () => {
    it('should GET /credit-cards/:id', () => {
      let result: CreditCardDto | undefined;
      service.getCreditCard(1).subscribe(r => result = r);
      http.expectOne(`${base}/credit-cards/1`).flush(mockCard);
      expect(result).toEqual(mockCard);
    });
  });

  // ─── createCreditCard() ───────────────────────────────────────────────────

  describe('createCreditCard()', () => {
    it('should POST and append card to signal', () => {
      service['_creditCards'].set([mockCard2]);
      service.createCreditCard({
        legalEntityId: 1, cardBrandId: 1, lastFourDigits: '1234',
        creditLimit: 5000, closingDay: 15, dueDay: 22,
      }).subscribe();
      http.expectOne(`${base}/credit-cards`).flush(mockCard);
      expect(service.creditCards().length).toBe(2);
      expect(service.creditCards().find(c => c.id === 1)).toEqual(mockCard);
    });
  });

  // ─── updateCreditCard() ───────────────────────────────────────────────────

  describe('updateCreditCard()', () => {
    it('should PATCH and replace card in signal', () => {
      service['_creditCards'].set([mockCard]);
      const updated = { ...mockCard, closingDay: 10, dueDay: 20, creditLimit: 8000 };
      service.updateCreditCard(1, { closingDay: 10, dueDay: 20, creditLimit: 8000 }).subscribe();
      http.expectOne(`${base}/credit-cards/1`).flush(updated);
      expect(service.creditCards()[0].closingDay).toBe(10);
      expect(service.creditCards()[0].creditLimit).toBe(8000);
    });
  });

  // ─── deleteCreditCard() ───────────────────────────────────────────────────

  describe('deleteCreditCard()', () => {
    it('should DELETE and remove card from signal', () => {
      service['_creditCards'].set([mockCard, mockCard2]);
      service.deleteCreditCard(1).subscribe();
      http.expectOne(`${base}/credit-cards/1`).flush(null);
      expect(service.creditCards().find(c => c.id === 1)).toBeUndefined();
      expect(service.creditCards().length).toBe(1);
    });
  });

  // ─── getBills() ───────────────────────────────────────────────────────────

  describe('getBills()', () => {
    it('should GET /credit-cards/:cardId/bills', () => {
      let result: CreditCardBillDto[] | undefined;
      service.getBills(1).subscribe(r => result = r);
      http.expectOne(`${base}/credit-cards/1/bills`).flush([mockBill]);
      expect(result).toEqual([mockBill]);
    });
  });

  // ─── getBill() ────────────────────────────────────────────────────────────

  describe('getBill()', () => {
    it('should GET /credit-cards/:cardId/bills/:billId', () => {
      let result: CreditCardBillDto | undefined;
      service.getBill(1, 10).subscribe(r => result = r);
      http.expectOne(`${base}/credit-cards/1/bills/10`).flush(mockBill);
      expect(result).toEqual(mockBill);
    });
  });

  // ─── getBillStatement() ───────────────────────────────────────────────────

  describe('getBillStatement()', () => {
    it('should GET /credit-cards/:cardId/bills/:billId/installments', () => {
      let result: BillStatementDto | undefined;
      service.getBillStatement(1, 10).subscribe(r => result = r);
      http.expectOne(`${base}/credit-cards/1/bills/10/installments`).flush(mockStatement);
      expect(result).toEqual(mockStatement);
    });
  });

  // ─── closeBill() ──────────────────────────────────────────────────────────

  describe('closeBill()', () => {
    it('should PUT /credit-cards/:cardId/bills/:billId/close', () => {
      const closed = { ...mockBill, status: 'CLOSED' as const };
      let result: CreditCardBillDto | undefined;
      service.closeBill(1, 10).subscribe(r => result = r);
      http.expectOne(`${base}/credit-cards/1/bills/10/close`).flush(closed);
      expect(result!.status).toBe('CLOSED');
    });
  });

  // ─── reopenBill() ─────────────────────────────────────────────────────────

  describe('reopenBill()', () => {
    it('should PUT /credit-cards/:cardId/bills/:billId/reopen', () => {
      const reopened = { ...mockBill, status: 'OPEN' as const };
      let result: CreditCardBillDto | undefined;
      service.reopenBill(1, 10).subscribe(r => result = r);
      http.expectOne(`${base}/credit-cards/1/bills/10/reopen`).flush(reopened);
      expect(result!.status).toBe('OPEN');
    });
  });

  // ─── payBill() ────────────────────────────────────────────────────────────

  describe('payBill()', () => {
    it('should PUT /credit-cards/:cardId/bills/:billId/pay with pocketId', () => {
      const paid = { ...mockBill, status: 'PAID' as const };
      let result: CreditCardBillDto | undefined;
      service.payBill(1, 10, { pocketId: 5 }).subscribe(r => result = r);
      const req = http.expectOne(`${base}/credit-cards/1/bills/10/pay`);
      expect(req.request.body).toEqual({ pocketId: 5 });
      req.flush(paid);
      expect(result!.status).toBe('PAID');
    });
  });

  // ─── createPurchase() ─────────────────────────────────────────────────────

  describe('createPurchase()', () => {
    it('should POST /credit-cards/:cardId/purchases', () => {
      let result: CreditCardPurchaseDto | undefined;
      service.createPurchase(1, {
        description: 'Geladeira', totalValue: 300,
        purchaseDate: '2025-03-01', installmentsCount: 3,
      }).subscribe(r => result = r);
      const req = http.expectOne(`${base}/credit-cards/1/purchases`);
      expect(req.request.body.description).toBe('Geladeira');
      req.flush(mockPurchase);
      expect(result).toEqual(mockPurchase);
    });
  });

  // ─── deletePurchase() ─────────────────────────────────────────────────────

  describe('deletePurchase()', () => {
    it('should DELETE /credit-cards/:cardId/purchases/:purchaseId', () => {
      let called = false;
      service.deletePurchase(1, 100).subscribe(() => called = true);
      http.expectOne(`${base}/credit-cards/1/purchases/100`).flush(null);
      expect(called).toBe(true);
    });
  });

  // ─── createInstallment() ──────────────────────────────────────────────────

  describe('createInstallment()', () => {
    it('should POST /credit-cards/:cardId/purchases/:purchaseId/installments', () => {
      let result: CreditCardInstallmentDto | undefined;
      service.createInstallment(1, 100, { installmentNumber: 1, amount: 100, categoryId: 1 }).subscribe(r => result = r);
      const req = http.expectOne(`${base}/credit-cards/1/purchases/100/installments`);
      expect(req.request.body).toEqual({ installmentNumber: 1, amount: 100, categoryId: 1 });
      req.flush(mockInstallment);
      expect(result).toEqual(mockInstallment);
    });
  });

  // ─── deleteInstallment() ──────────────────────────────────────────────────

  describe('deleteInstallment()', () => {
    it('should DELETE /credit-cards/:cardId/purchases/:purchaseId/installments/:installmentId', () => {
      let called = false;
      service.deleteInstallment(1, 100, 200).subscribe(() => called = true);
      http.expectOne(`${base}/credit-cards/1/purchases/100/installments/200`).flush(null);
      expect(called).toBe(true);
    });
  });

  // ─── createRefund() ───────────────────────────────────────────────────────

  describe('createRefund()', () => {
    it('should POST /credit-cards/:cardId/bills/:billId/refunds', () => {
      let result: CreditCardRefundDto | undefined;
      service.createRefund(1, 10, {
        description: 'Estorno X', amount: 50,
        refundDate: '2025-03-10', categoryId: 9,
      }).subscribe(r => result = r);
      const req = http.expectOne(`${base}/credit-cards/1/bills/10/refunds`);
      expect(req.request.body.description).toBe('Estorno X');
      req.flush(mockRefund);
      expect(result).toEqual(mockRefund);
    });
  });

  // ─── deleteRefund() ───────────────────────────────────────────────────────

  describe('deleteRefund()', () => {
    it('should DELETE /credit-cards/:cardId/bills/:billId/refunds/:refundId', () => {
      let called = false;
      service.deleteRefund(1, 10, 300).subscribe(() => called = true);
      http.expectOne(`${base}/credit-cards/1/bills/10/refunds/300`).flush(null);
      expect(called).toBe(true);
    });
  });
});