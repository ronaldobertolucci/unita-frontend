import { TransactionService } from '../../../core/services/transaction.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { CreditCardDetailComponent } from './credit-card-detail.component';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { PocketService } from '../../../core/services/pocket.service';
import { CategoryService } from '../../../core/services/category.service';
import { CreditCardDto, CreditCardBillDto, CreditCardPurchaseDto } from '../../../core/models/credit-card.model';
import { PocketSummaryDto } from '../../../core/models/pocket.model';
import { CategoryDto } from '../../../core/models/category.model';

const mockCard: CreditCardDto = {
  id: 1, legalEntityCorporateName: 'Banco X', lastFourDigits: '1234',
  cardBrand: 'Visa', creditLimit: 5000, closingDay: 15, dueDay: 22,
};

const mockBillOpen: CreditCardBillDto = {
  id: 10, closingDate: '2025-04-15', dueDate: '2025-04-22',
  status: 'OPEN', totalInstallments: 300, totalRefunds: 0, totalAmount: 300,
};

const mockBillClosed: CreditCardBillDto = {
  id: 11, closingDate: '2025-03-15', dueDate: '2025-03-22',
  status: 'CLOSED', totalInstallments: 500, totalRefunds: 0, totalAmount: 500,
};

const mockBillPaid: CreditCardBillDto = {
  id: 12, closingDate: '2025-02-15', dueDate: '2025-02-22',
  status: 'PAID', totalInstallments: 200, totalRefunds: 0, totalAmount: 200,
};

const mockPocketBank: PocketSummaryDto = { id: 5, type: 'BANK_ACCOUNT', label: 'Banco X – Corrente', active: true, balance: 2000 };
const mockPocketCash: PocketSummaryDto = { id: 6, type: 'CASH', label: 'Carteira', active: true, balance: 100 };
const mockPocketBenefit: PocketSummaryDto = { id: 7, type: 'BENEFIT_ACCOUNT', label: 'VA', active: true, balance: 300 };

const mockCategory: CategoryDto = { id: 1, name: 'Alimentação', type: 'EXPENSE', global: false };

const mockPurchase: CreditCardPurchaseDto = {
  id: 100, description: 'Notebook', totalValue: 300,
  purchaseDate: '2025-04-01', installmentsCount: 3,
  installments: [1, 2, 3].map(number => ({ id: 199 + number, installmentNumber: number, amount: 100, creditCardBillId: 10,
    installmentDate: `2025-0${3 + number}-01`, billDueDate: `2025-0${3 + number}-22`, category: mockCategory })),
};

function buildCreditCardService() {
  return {
    loadCreditCards: jest.fn().mockReturnValue(of([mockCard])),
    getBill: jest.fn().mockReturnValue(of({ ...mockBillClosed, status: 'PAID' as const })),
    getCreditCard: jest.fn().mockReturnValue(of(mockCard)),
    getBills: jest.fn().mockReturnValue(of([mockBillOpen, mockBillClosed, mockBillPaid])),
    closeBill: jest.fn().mockReturnValue(of({ ...mockBillOpen, status: 'CLOSED' as const })),
    reopenBill: jest.fn().mockReturnValue(of({ ...mockBillClosed, status: 'OPEN' as const })),
    payBill: jest.fn().mockReturnValue(of({ ...mockBillClosed, status: 'PAID' as const })),
    createPurchase: jest.fn().mockReturnValue(of(mockPurchase)),
    getPurchase: jest.fn().mockReturnValue(of(mockPurchase)),
    updatePurchase: jest.fn().mockReturnValue(of(mockPurchase)),
    deletePurchase: jest.fn().mockReturnValue(of(undefined)),
    getPurchases: jest.fn().mockReturnValue(of([mockPurchase])),
    getInstallments: jest.fn().mockReturnValue(of([])),
    createInstallment: jest.fn().mockReturnValue(of({ id: 200, installmentNumber: 1, amount: 100, creditCardBillId: 10, billDueDate: '2025-04-22', category: mockCategory })),
  };
}

function buildPocketService(pockets: PocketSummaryDto[] = []) {
  return {
    pockets: signal(pockets),
    getBalance: jest.fn().mockReturnValue(of(100)),
    loadPockets: jest.fn().mockReturnValue(of(pockets)),
  };
}

function buildCategoryService(categories: CategoryDto[] = []) {
  return {
    categories: signal(categories),
    loadCategories: jest.fn().mockReturnValue(of(categories)),
  };
}

describe('CreditCardDetailComponent', () => {
  let fixture: ComponentFixture<CreditCardDetailComponent>;
  let component: CreditCardDetailComponent;
  let creditCardServiceSpy: ReturnType<typeof buildCreditCardService>;
  let pocketServiceSpy: ReturnType<typeof buildPocketService>;
  let categoryServiceSpy: ReturnType<typeof buildCategoryService>;
  let routerSpy: { navigate: jest.Mock };

  function setup(
    pockets: PocketSummaryDto[] = [mockPocketBank, mockPocketCash],
    categories: CategoryDto[] = [mockCategory]
  ) {
    creditCardServiceSpy = buildCreditCardService();
    pocketServiceSpy = buildPocketService(pockets);
    categoryServiceSpy = buildCategoryService(categories);
    routerSpy = { navigate: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [CreditCardDetailComponent, RouterTestingModule],
      providers: [{ provide: TransactionService, useValue: { getTransactions: jest.fn().mockReturnValue(of([])) } },
        { provide: CreditCardService, useValue: creditCardServiceSpy },
        { provide: PocketService, useValue: pocketServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });

    fixture = TestBed.createComponent(CreditCardDetailComponent);
    component = fixture.componentInstance;
    jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  it('preserves purchase order when opening and refreshing its details', () => {
    setup();
    const second = { ...mockPurchase, id: 101 };
    const updated = { ...mockPurchase, description: 'Descrição atualizada' };
    component.purchases.set([mockPurchase, second]);
    creditCardServiceSpy.getPurchase.mockReturnValue(of(updated));

    component.openPurchaseDetail(mockPurchase);

    expect(component.purchases()).toEqual([updated, second]);
    expect(component.currentPurchase()).toEqual(updated);
    component.closeModal();
    component.openPurchaseDetail(updated);
    expect(component.purchases().map(p => p.id)).toEqual([100, 101]);
  });

  describe('purchase history filter', () => {
    it.each([
      ['2026-01-15T12:00:00', '2025-12-17', '2026-01-15'],
      ['2024-03-01T12:00:00', '2024-02-01', '2024-03-01'],
    ])('loads the last 30 calendar days at %s', (now, startDate, endDate) => {
      jest.useFakeTimers().setSystemTime(new Date(now));
      try {
        setup();
        expect(component.purchaseFilterForm.getRawValue()).toEqual({ startDate, endDate });
        expect(creditCardServiceSpy.getPurchases).toHaveBeenCalledWith(1, startDate, endDate);
      } finally { jest.useRealTimers(); }
    });

    it('rejects inverted dates without fetching or changing the applied period', () => {
      setup();
      const original = component.appliedPurchasePeriod();
      creditCardServiceSpy.getPurchases.mockClear();
      component.purchaseFilterForm.setValue({ startDate: '2026-10-30', endDate: '2026-09-01' });
      component.applyPurchaseFilter();
      expect(component.purchaseFilterError()).toBeTruthy();
      expect(component.appliedPurchasePeriod()).toEqual(original);
      expect(creditCardServiceSpy.getPurchases).not.toHaveBeenCalled();
    });

    it('keeps the applied dates on refresh and ignores older responses', () => {
      setup();
      const older = new Subject<CreditCardPurchaseDto[]>();
      const newer = new Subject<CreditCardPurchaseDto[]>();
      creditCardServiceSpy.getPurchases.mockReturnValueOnce(older).mockReturnValueOnce(newer);
      component.purchaseFilterForm.setValue({ startDate: '2025-04-01', endDate: '2025-04-30' });
      component.applyPurchaseFilter();
      component.refreshPurchaseHistory();
      newer.next([mockPurchase]); newer.complete();
      older.next([]); older.complete();
      expect(component.visiblePurchases()).toEqual([mockPurchase]);
      expect(component.isLoadingPurchases()).toBe(false);
      expect(creditCardServiceSpy.getPurchases).toHaveBeenLastCalledWith(1, '2025-04-01', '2025-04-30');
    });

    it('uses inclusive bounds, including after full-history reconciliation', () => {
      setup();
      component.purchaseFilterForm.setValue({ startDate: '2025-04-01', endDate: '2025-04-01' });
      component.applyPurchaseFilter();
      component.purchases.set([mockPurchase, { ...mockPurchase, id: 101, purchaseDate: '2025-03-31' }]);
      expect(component.visiblePurchases()).toEqual([mockPurchase]);
    });

    it('supports an open range and restores the default period', () => {
      setup();
      const initial = component.appliedPurchasePeriod();
      component.purchaseFilterForm.setValue({ startDate: '', endDate: '' });
      component.applyPurchaseFilter();
      expect(creditCardServiceSpy.getPurchases).toHaveBeenLastCalledWith(1, undefined, undefined);
      component.resetPurchaseFilter();
      expect(component.appliedPurchasePeriod()).toEqual(initial);
    });
  });

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should load card and bills on init', () => {
      expect(creditCardServiceSpy.getCreditCard).toHaveBeenCalledWith(1);
      expect(creditCardServiceSpy.getBills).toHaveBeenCalledWith(1);
    });

    it('should set card signal', () => {
      expect(component.card()).toEqual(mockCard);
    });

    it('should not reload pockets if already loaded', () => {
      expect(pocketServiceSpy.loadPockets).not.toHaveBeenCalled();
    });
  });

  describe('initialization — pockets empty', () => {
    it('should load pockets if signal is empty', () => {
      setup([]);
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalled();
    });
  });

  describe('initialization — categories empty', () => {
    it('should load categories if signal is empty', () => {
      setup([], []);
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalled();
    });
  });

  // ─── activeBills / paidBills ──────────────────────────────────────────────

  describe('activeBills()', () => {
    beforeEach(() => setup());

    it('should exclude PAID bills', () => {
      expect(component.activeBills().find(b => b.status === 'PAID')).toBeUndefined();
    });

    it('should sort by dueDate ascending', () => {
      const dates = component.activeBills().map(b => b.dueDate);
      expect(dates).toEqual([...dates].sort());
    });
  });

  describe('paidBills()', () => {
    beforeEach(() => setup());

    it('should include only PAID bills', () => {
      expect(component.paidBills().every(b => b.status === 'PAID')).toBe(true);
    });

    it('should sort by dueDate descending', () => {
      const dates = component.paidBills().map(b => b.dueDate);
      expect(dates).toEqual([...dates].sort().reverse());
    });
  });

  // ─── totalOpenBills() ─────────────────────────────────────────────────────

  describe('totalOpenBills()', () => {
    beforeEach(() => setup());

    it('should sum totalAmount of active bills only', () => {
      // mockBillOpen (300) + mockBillClosed (500) = 800; mockBillPaid (200) excluded
      expect(component.totalOpenBills()).toBe(800);
    });
  });

  // ─── eligiblePockets ──────────────────────────────────────────────────────

  describe('eligiblePockets()', () => {
    it('should include only BANK_ACCOUNT and CASH', () => {
      setup([mockPocketBank, mockPocketCash, mockPocketBenefit]);
      const types = component.eligiblePockets().map(p => p.type);
      expect(types).toContain('BANK_ACCOUNT');
      expect(types).toContain('CASH');
      expect(types).not.toContain('BENEFIT_ACCOUNT');
    });
  });

  // ─── closeBill() ──────────────────────────────────────────────────────────

  describe('closeBill()', () => {
    beforeEach(() => setup());

    it('should update bill status in signal on success', () => {
      creditCardServiceSpy.getBills.mockReturnValue(of([{ ...mockBillOpen, status: 'CLOSED' }, mockBillClosed, mockBillPaid]));
      component.closeBill(mockBillOpen);
      expect(creditCardServiceSpy.closeBill).toHaveBeenCalledWith(1, 10);
      expect(component.bills().find(b => b.id === 10)?.status).toBe('CLOSED');
    });

    it('should set inlineError on failure', () => {
      creditCardServiceSpy.closeBill.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.closeBill(mockBillOpen);
      expect(component.inlineError()?.billId).toBe(10);
    });
  });

  // ─── reopenBill() ─────────────────────────────────────────────────────────

  describe('reopenBill()', () => {
    beforeEach(() => setup());

    it('should update bill status to OPEN on success', () => {
      creditCardServiceSpy.getBills.mockReturnValue(of([mockBillOpen, { ...mockBillClosed, status: 'OPEN' }, mockBillPaid]));
      component.reopenBill(mockBillClosed);
      expect(creditCardServiceSpy.reopenBill).toHaveBeenCalledWith(1, 11);
      expect(component.bills().find(b => b.id === 11)?.status).toBe('OPEN');
    });

    it('should set inlineError on failure', () => {
      creditCardServiceSpy.reopenBill.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.reopenBill(mockBillClosed);
      expect(component.inlineError()?.billId).toBe(11);
    });
  });

  // ─── openPayModal() / payBill() ───────────────────────────────────────────

  describe('payBill()', () => {
    beforeEach(() => setup());

    it('should not submit when pocketId is not selected', () => {
      component.openPayModal(mockBillClosed);
      component.payBill();
      expect(creditCardServiceSpy.payBill).not.toHaveBeenCalled();
      expect(component.payForm.touched).toBe(true);
    });

    it('should call payBill and close modal on success', () => {
      component.openPayModal(mockBillClosed);
      component.payForm.patchValue({ pocketId: 5 });
      component.payBill();
      expect(creditCardServiceSpy.payBill).toHaveBeenCalledWith(1, 11, { pocketId: 5 });
      expect(component.activeModal()).toBeNull();
      expect(component.bills().find(b => b.id === 11)?.status).toBe('PAID');
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.payBill.mockReturnValue(
        throwError(() => ({ error: { message: 'Saldo insuficiente' } }))
      );
      component.openPayModal(mockBillClosed);
      component.payForm.patchValue({ pocketId: 5 });
      component.payBill();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  describe('formatCurrency()', () => {
    beforeEach(() => setup());

    it('should format value as BRL', () => {
      expect(component.formatCurrency(5000)).toContain('5.000');
    });
  });

  describe('formatDate()', () => {
    beforeEach(() => setup());

    it('should convert yyyy-MM-dd to dd/MM/yyyy', () => {
      expect(component.formatDate('2025-04-15')).toBe('15/04/2025');
    });
  });

  describe('getBillStatusLabel()', () => {
    beforeEach(() => setup());

    it('should return correct labels', () => {
      expect(component.getBillStatusLabel('OPEN')).toBe('Aberta');
      expect(component.getBillStatusLabel('CLOSED')).toBe('Fechada');
      expect(component.getBillStatusLabel('PAID')).toBe('Paga');
    });
  });

  describe('paidBillsVisible', () => {
    beforeEach(() => setup());

    it('should start as false', () => {
      expect(component.paidBillsVisible()).toBe(false);
    });

    it('should toggle when set', () => {
      component.paidBillsVisible.set(true);
      expect(component.paidBillsVisible()).toBe(true);
    });
  });

  it('prevents double payment and refreshes the paying pocket after success', () => {
    setup();
    const response = new Subject<CreditCardBillDto>();
    creditCardServiceSpy.payBill.mockReturnValue(response);
    component.openPayModal(mockBillClosed);
    component.payForm.setValue({ pocketId: 5 });
    component.payBill();
    component.payBill();
    expect(creditCardServiceSpy.payBill).toHaveBeenCalledTimes(1);
    response.next({ ...mockBillClosed, status: 'PAID' });
    response.complete();
    expect(TestBed.inject(TransactionService).getTransactions).toHaveBeenCalledWith(5);
    expect(pocketServiceSpy.getBalance).toHaveBeenCalledWith(5);
  });

  it('blocks resending an uncertain payment even after closing and reopening the modal', () => {
    setup();
    creditCardServiceSpy.payBill.mockReturnValue(throwError(() => ({ status: 0 })));
    component.openPayModal(mockBillClosed);
    component.payForm.setValue({ pocketId: 5 });
    component.payBill();
    expect(component.financialRecovery.state()).toBe('review');
    component.openPayModal(mockBillClosed);
    component.payForm.setValue({ pocketId: 5 });
    component.payBill();
    expect(creditCardServiceSpy.payBill).toHaveBeenCalledTimes(1);
  });

  describe('US-03 bill concurrency', () => {
    it.each([0, -100])('hides payment and rejects direct submission for total %s', totalAmount => {
      setup();
      const bill = { ...mockBillClosed, totalAmount };
      component.bills.set([bill]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Pagar fatura');
      expect(fixture.nativeElement.textContent).toContain(totalAmount === 0 ? 'Fatura zerada' : 'Saldo credor');
      component.openPayModal(bill);
      expect(component.activeModal()).toBeNull();
      component.selectedBill.set(bill);
      component.payForm.setValue({ pocketId: 5 });
      component.payBill();
      expect(creditCardServiceSpy.payBill).not.toHaveBeenCalled();
    });

    it('does not submit an open bill even through a stale modal', () => {
      setup();
      component.selectedBill.set(mockBillOpen);
      component.payForm.setValue({ pocketId: 5 });
      component.payBill();
      expect(creditCardServiceSpy.payBill).not.toHaveBeenCalled();
    });

    it.each(['OPEN', 'PAID'] as const)('reconsults a domain 409 and displays actual status %s without assuming success', status => {
      setup();
      creditCardServiceSpy.payBill.mockReturnValue(throwError(() => ({ status: 409, error: { error: 'Conflict', message: 'Only closed bills can be paid' } })));
      creditCardServiceSpy.getBill.mockReturnValue(of({ ...mockBillClosed, status }));
      component.openPayModal(mockBillClosed);
      component.payForm.setValue({ pocketId: 5 });
      component.payBill();
      expect(creditCardServiceSpy.getBill).toHaveBeenCalledWith(1, 11);
      expect(component.bills().find(b => b.id === 11)?.status).toBe(status);
      expect(component.selectedBill()?.status).toBe(status);
      expect(component.errorMessage()).toContain('Somente faturas fechadas');
      expect(TestBed.inject(TransactionService).getTransactions).toHaveBeenCalledWith(5);
      component.payBill();
      expect(creditCardServiceSpy.payBill).toHaveBeenCalledTimes(1);
    });

    it('reconsults the exact bill and the list after payment success', () => {
      setup();
      component.openPayModal(mockBillClosed);
      component.payForm.setValue({ pocketId: 5 });
      component.payBill();
      expect(creditCardServiceSpy.getBill).toHaveBeenCalledWith(1, 11);
      expect(creditCardServiceSpy.getBills).toHaveBeenCalledTimes(2);
    });

    it('prevents repeated close or reopen while a bill write is pending', () => {
      setup();
      const response = new Subject<CreditCardBillDto>();
      creditCardServiceSpy.closeBill.mockReturnValue(response);
      component.closeBill(mockBillOpen);
      component.closeBill(mockBillOpen);
      component.reopenBill(mockBillClosed);
      expect(creditCardServiceSpy.closeBill).toHaveBeenCalledTimes(1);
      expect(creditCardServiceSpy.reopenBill).not.toHaveBeenCalled();
      response.next({ ...mockBillOpen, status: 'CLOSED' });
      response.complete();
      expect(component.isSaving()).toBe(false);
    });

    it('consults the current bill after a lock timeout and keeps payment blocked for reconciliation', () => {
      setup();
      creditCardServiceSpy.payBill.mockReturnValue(throwError(() => ({ status: 503, error: { error: 'Concurrency Timeout' } })));
      component.openPayModal(mockBillClosed);
      component.payForm.setValue({ pocketId: 5 });
      component.payBill();
      fixture.detectChanges();
      expect(component.financialRecovery.operation()?.message).toContain('tempo de espera');
      expect(component.financialRecovery.state()).toBe('review');
      expect(component.bills().find(b => b.id === 11)?.status).toBe('PAID');
      component.payBill();
      expect(creditCardServiceSpy.payBill).toHaveBeenCalledTimes(1);
    });
  });


  describe('US-04 complete purchase plan', () => {
    function fill(mode: 'AUTOMATIC' | 'CUSTOM' = 'AUTOMATIC') {
      component.openCreatePurchaseModal();
      component.purchaseForm.patchValue({ description: 'Compra', totalValue: '100.00', purchaseDate: '2027-01-31',
        installmentsCount: 3, categoryId: 1, installmentMode: mode });
    }

    beforeEach(() => setup());

    it.each([',', '.'])('updates the preview only after blur when typing decimal separator %s', separator => {
      component.openCreatePurchaseModal();
      component.purchaseForm.patchValue({ installmentsCount: 3 });
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#purchaseValue');
      const preview = () => fixture.nativeElement.querySelector('.plan-preview');
      const type = (value: string) => {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      };
      const blur = () => {
        input.dispatchEvent(new Event('blur'));
        fixture.detectChanges();
      };

      type('100');
      expect(preview()).toBeNull();
      type(`100${separator}`);
      expect(preview()).toBeNull();
      type(`100${separator}50`);
      expect(preview()).toBeNull();
      blur();
      expect(preview()).not.toBeNull();
      expect(component.automaticAmounts()).toEqual([3350, 3350, 3350]);

      const previousPreview = preview();
      type(`200${separator}`);
      expect(preview()).toBe(previousPreview);
      expect(component.controlError('totalValue')).toBeNull();
      type(`200${separator}10`);
      expect(component.automaticAmounts()).toEqual([3350, 3350, 3350]);
      blur();
      expect(component.automaticAmounts()).toEqual([6670, 6670, 6670]);

      component.purchaseForm.patchValue({ installmentsCount: 2 });
      fixture.detectChanges();
      expect(component.automaticAmounts()).toEqual([10005, 10005]);
      type(`200${separator}`);
      expect(preview()).not.toBeNull();
      blur();
      expect(preview()).toBeNull();
      expect(component.controlError('totalValue')).toContain('valor positivo');

      type(`200${separator}10`);
      blur();
      expect(preview()).not.toBeNull();
      component.closeModal();
      component.openCreatePurchaseModal();
      fixture.detectChanges();
      expect(preview()).toBeNull();
    });

    it('sends one complete automatic POST, omits installments and shows the official response', () => {
      fill();
      const official = { ...mockPurchase, totalValue: 100, installments: mockPurchase.installments.map((i, index) => ({
        ...i, amount: index === 2 ? 33.34 : 33.33, installmentDate: ['2027-01-31', '2027-02-28', '2027-03-31'][index],
      })) };
      creditCardServiceSpy.createPurchase.mockReturnValue(of(official));
      expect(component.automaticAmounts()).toEqual([3333, 3333, 3334]);
      component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalledWith(1, {
        description: 'Compra', totalValue: 100, purchaseDate: '2027-01-31', installmentsCount: 3,
        categoryId: 1, installmentMode: 'AUTOMATIC',
      });
      expect(creditCardServiceSpy.createInstallment).not.toHaveBeenCalled();
      expect(creditCardServiceSpy.deletePurchase).not.toHaveBeenCalled();
      expect(component.currentPurchase()).toEqual(official);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('28/02/2027');
      expect(fixture.nativeElement.textContent).toContain('33,34');
    });

    it('creates a cash purchase with one installment and accepts a neutral default category', () => {
      categoryServiceSpy.categories.set([{ ...mockCategory, type: 'NEUTRAL' }]);
      fill();
      component.purchaseForm.patchValue({ installmentsCount: 1 });
      component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalledWith(1, expect.objectContaining({ installmentsCount: 1, categoryId: 1 }));
    });

    it('sends custom amounts and optional category overrides in one POST', () => {
      categoryServiceSpy.categories.set([mockCategory, { id: 2, name: 'Outros', type: 'NEUTRAL', global: true }]);
      fill('CUSTOM');
      component.purchaseForm.patchValue({ installmentsCount: 2 });
      component.installmentRows.at(0).setValue({ amount: '40,00', categoryId: 2 });
      component.installmentRows.at(1).setValue({ amount: '60.00', categoryId: null });
      component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalledWith(1, expect.objectContaining({
        installmentMode: 'CUSTOM', installments: [{ installmentNumber: 1, amount: 40, categoryId: 2 }, { installmentNumber: 2, amount: 60 }],
      }));
    });

    it.each(['0', '0.001', '100.001', '9999999999999.999', '10000000000000', '-1'])('rejects invalid money %s before sending', value => {
      fill(); component.purchaseForm.patchValue({ totalValue: value }); component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).not.toHaveBeenCalled();
    });

    it.each([0, 121, 1.5])('rejects count %s before sending', count => {
      fill(); component.purchaseForm.patchValue({ installmentsCount: count }); component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).not.toHaveBeenCalled();
    });

    it('rejects zero installments and divergent custom sums', () => {
      fill(); component.purchaseForm.patchValue({ totalValue: '0.02' }); component.submitPurchase();
      expect(component.planError()).toContain('zero');
      component.purchaseForm.patchValue({ totalValue: '100', installmentMode: 'CUSTOM' });
      component.installmentRows.controls.forEach(row => row.patchValue({ amount: '33.33' }));
      component.submitPurchase();
      expect(component.planError()).toContain('soma');
      expect(creditCardServiceSpy.createPurchase).not.toHaveBeenCalled();
    });

    it('rejects an income or unavailable category', () => {
      fill(); component.purchaseForm.patchValue({ categoryId: 9 }); component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('categorias disponíveis');
    });

    it('blocks duplicate clicks and modal dismissal while the complete POST is pending', () => {
      fill();
      const response = new Subject<CreditCardPurchaseDto>();
      creditCardServiceSpy.createPurchase.mockReturnValue(response);
      component.submitPurchase(); component.submitPurchase(); component.closeModal();
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalledTimes(1);
      expect(component.activeModal()).toBe('purchase-form');
      response.next(mockPurchase); response.complete();
      expect(component.activeModal()).toBe('purchase-detail');
    });

    it('preserves form and displays nested server validation errors', () => {
      fill('CUSTOM');
      component.installmentRows.controls.forEach((row, index) => row.patchValue({ amount: index === 2 ? '33.34' : '33.33' }));
      creditCardServiceSpy.createPurchase.mockReturnValue(throwError(() => ({ status: 400, error: { error: 'Validation Failed',
        message: 'Invalid input data', errors: [{ field: 'installments[0].amount', message: 'numeric value out of bounds' }],
        details: ['categoryId: must not be null'] } })));
      component.submitPurchase(); fixture.detectChanges();
      expect(component.purchaseForm.value.description).toBe('Compra');
      expect(component.controlError('installments[0].amount', component.installmentRows.at(0).controls.amount)).toContain('duas casas');
      expect(component.controlError('categoryId')).toBe('Obrigatório.');
      expect(component.activeModal()).toBe('purchase-form');
    });

    it.each([0, 408, 500, 503])('requires fresh purchases and bills plus reconciliation after uncertain status %s', status => {
      fill();
      creditCardServiceSpy.createPurchase.mockReturnValue(throwError(() => ({ status })));
      component.submitPurchase();
      expect(creditCardServiceSpy.getPurchases).toHaveBeenCalledTimes(2);
      expect(component.financialRecovery.state()).toBe('review');
      expect(component.financialRecovery.purchases()).toEqual([mockPurchase]);
      component.submitPurchase();
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalledTimes(1);
      expect(creditCardServiceSpy.deletePurchase).not.toHaveBeenCalled();
    });

    it('keeps operations blocked if history cannot be read after a lost response', () => {
      fill();
      creditCardServiceSpy.createPurchase.mockReturnValue(throwError(() => ({ status: 0 })));
      creditCardServiceSpy.getPurchases.mockReturnValue(throwError(() => ({ status: 500 })));
      component.submitPurchase(); component.financialRecovery.confirm(); component.submitPurchase();
      expect(component.financialRecovery.state()).toBe('pending');
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalledTimes(1);
    });

    it('does not overwrite a fresh detail with an older reconciliation snapshot', () => {
      fill();
      creditCardServiceSpy.createPurchase.mockReturnValue(throwError(() => ({ status: 0 })));
      component.submitPurchase();
      fixture.detectChanges();
      const updated = { ...mockPurchase, description: 'Corrigida em outra sessão',
        installments: mockPurchase.installments.map(i => ({ ...i, id: i.id + 100 })) };
      creditCardServiceSpy.getPurchase.mockReturnValue(of(updated));
      component.openPurchaseDetail(mockPurchase);
      fixture.detectChanges();
      expect(component.currentPurchase()).toEqual(updated);
      expect(component.financialRecovery.state()).toBe('review');
    });

    it('reads detail and current bills before editing and replaces all installment IDs after PUT', () => {
      component.openPurchaseDetail(mockPurchase); component.openEditPurchaseModal();
      expect(creditCardServiceSpy.getPurchase).toHaveBeenCalledTimes(2);
      expect(component.purchaseForm.value.installmentMode).toBe('CUSTOM');
      const updated = { ...mockPurchase, installments: mockPurchase.installments.map(i => ({ ...i, id: i.id + 100 })) };
      creditCardServiceSpy.updatePurchase.mockReturnValue(of(updated));
      creditCardServiceSpy.getPurchases.mockReturnValue(of([updated]));
      component.submitPurchase();
      expect(creditCardServiceSpy.updatePurchase).toHaveBeenCalledWith(1, 100, expect.objectContaining({ installmentMode: 'CUSTOM',
        installments: [1, 2, 3].map(number => ({ installmentNumber: number, amount: 100, categoryId: 1 })) }));
      expect(component.currentPurchase()!.installments.map(i => i.id)).toEqual([300, 301, 302]);
      expect(component.purchases()).toEqual([updated]);
    });

    it.each(['CLOSED', 'PAID'] as const)('blocks editing purchases containing %s bills', status => {
      creditCardServiceSpy.getBills.mockReturnValue(of([{ ...mockBillOpen, status }]));
      component.openPurchaseDetail(mockPurchase); component.openEditPurchaseModal();
      expect(component.canEditPurchase()).toBe(false);
      expect(component.activeModal()).toBe('purchase-detail');
      expect(creditCardServiceSpy.updatePurchase).not.toHaveBeenCalled();
    });

    it('blocks an open bill with a payment reference', () => {
      creditCardServiceSpy.getBills.mockReturnValue(of([{ ...mockBillOpen, paymentId: 5 }]));
      component.openPurchaseDetail(mockPurchase);
      expect(component.canEditPurchase()).toBe(false);
    });

    it('reloads a protected PUT without discarding the entered correction', () => {
      component.openPurchaseDetail(mockPurchase); component.openEditPurchaseModal();
      component.purchaseForm.patchValue({ description: 'Correção' });
      creditCardServiceSpy.updatePurchase.mockReturnValue(throwError(() => ({ status: 409, error: { message:
        'Bill composition is protected. Only open bills without a payment can be changed' } })));
      creditCardServiceSpy.getBills.mockReturnValue(of([{ ...mockBillOpen, status: 'PAID' }]));
      component.submitPurchase();
      expect(creditCardServiceSpy.getPurchase).toHaveBeenCalledTimes(3);
      expect(component.purchaseForm.value.description).toBe('Correção');
      expect(component.canEditPurchase()).toBe(false);
      expect(component.errorMessage()).toContain('protegida');
      expect(component.currentPurchase()).toEqual(mockPurchase);
    });

    it('keeps missing legacy rows blank until the user explicitly provides a complete plan', () => {
      const legacy = { ...mockPurchase, installments: [mockPurchase.installments[0]] };
      creditCardServiceSpy.getPurchase.mockReturnValue(of(legacy));
      component.openPurchaseDetail(legacy); component.openEditPurchaseModal();
      expect(component.isIncompletePurchase(legacy)).toBe(true);
      expect(component.installmentRows.at(1).value.amount).toBe('');
      component.submitPurchase();
      expect(creditCardServiceSpy.updatePurchase).not.toHaveBeenCalled();
    });
  });

  it('blocks payment of nonpositive totals and bills with legacy payments', () => {
    setup();
    for (const bill of [{ ...mockBillClosed, totalAmount: 0 }, { ...mockBillClosed, totalAmount: -40 },
      { ...mockBillClosed, paymentId: 33 }]) {
      expect(component.canPay(bill)).toBe(false);
      component.openPayModal(bill);
    }
    expect(component.activeModal()).toBeNull();
    expect(creditCardServiceSpy.payBill).not.toHaveBeenCalled();
  });

});
