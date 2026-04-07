import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { of, throwError } from 'rxjs';
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

const mockPocketBank: PocketSummaryDto = { id: 5, type: 'BANK_ACCOUNT', label: 'Banco X – Corrente', balance: 2000 };
const mockPocketCash: PocketSummaryDto = { id: 6, type: 'CASH', label: 'Carteira', balance: 100 };
const mockPocketBenefit: PocketSummaryDto = { id: 7, type: 'BENEFIT_ACCOUNT', label: 'VA', balance: 300 };

const mockCategory: CategoryDto = { id: 1, name: 'Alimentação', type: 'EXPENSE', global: false };

const mockPurchase: CreditCardPurchaseDto = {
  id: 100, description: 'Notebook', totalValue: 300,
  purchaseDate: '2025-04-01', installmentsCount: 3,
};

function buildCreditCardService() {
  return {
    getCreditCard: jest.fn().mockReturnValue(of(mockCard)),
    getBills: jest.fn().mockReturnValue(of([mockBillOpen, mockBillClosed, mockBillPaid])),
    closeBill: jest.fn().mockReturnValue(of({ ...mockBillOpen, status: 'CLOSED' as const })),
    reopenBill: jest.fn().mockReturnValue(of({ ...mockBillClosed, status: 'OPEN' as const })),
    payBill: jest.fn().mockReturnValue(of({ ...mockBillClosed, status: 'PAID' as const })),
    createPurchase: jest.fn().mockReturnValue(of(mockPurchase)),
    deletePurchase: jest.fn().mockReturnValue(of(undefined)),
    createInstallment: jest.fn().mockReturnValue(of({ id: 200, installmentNumber: 1, amount: 100, creditCardBillId: 10, billDueDate: '2025-04-22', category: mockCategory })),
  };
}

function buildPocketService(pockets: PocketSummaryDto[] = []) {
  return {
    pockets: signal(pockets),
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
      providers: [
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

  // ─── Fluxo de compra — step 1 ─────────────────────────────────────────────

  describe('submitPurchaseStep1()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openCreatePurchaseModal();
      component.submitPurchaseStep1();
      expect(creditCardServiceSpy.createPurchase).not.toHaveBeenCalled();
    });

    it('should create purchase and advance to step 2 on success', () => {
      component.openCreatePurchaseModal();
      component.purchaseStep1Form.setValue({
        description: 'Notebook', totalValue: 300,
        purchaseDate: '2025-04-01', installmentsCount: 3,
      });
      component.submitPurchaseStep1();
      expect(creditCardServiceSpy.createPurchase).toHaveBeenCalled();
      expect(component.activeModal()).toBe('create-purchase-step2');
      expect(component.currentPurchase()).toEqual(mockPurchase);
      expect(component.currentInstallmentIndex()).toBe(1);
    });

    it('should suggest installment amount as totalValue / installmentsCount', () => {
      component.openCreatePurchaseModal();
      component.purchaseStep1Form.setValue({
        description: 'Notebook', totalValue: 300,
        purchaseDate: '2025-04-01', installmentsCount: 3,
      });
      component.submitPurchaseStep1();
      expect(component.installmentForm.value.amount).toBe(100);
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.createPurchase.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.openCreatePurchaseModal();
      component.purchaseStep1Form.setValue({
        description: 'Notebook', totalValue: 300,
        purchaseDate: '2025-04-01', installmentsCount: 3,
      });
      component.submitPurchaseStep1();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.activeModal()).toBe('create-purchase-step1');
    });
  });

  // ─── Fluxo de compra — step 2 ─────────────────────────────────────────────

  describe('submitInstallment()', () => {
    beforeEach(() => {
      setup();
      component.currentPurchase.set(mockPurchase);
      component.currentInstallmentIndex.set(1);
      component.activeModal.set('create-purchase-step2');
    });

    it('should advance index on non-last installment', () => {
      component.installmentForm.setValue({ amount: 100, categoryId: 1 });
      component.submitInstallment();
      expect(component.currentInstallmentIndex()).toBe(2);
      expect(component.activeModal()).toBe('create-purchase-step2');
    });

    it('should preserve categoryId when advancing', () => {
      component.installmentForm.setValue({ amount: 100, categoryId: 1 });
      component.submitInstallment();
      expect(component.installmentForm.value.categoryId).toBe(1);
    });

    it('should close modal and reload bills on last installment', () => {
      component.currentInstallmentIndex.set(3);
      component.installmentForm.setValue({ amount: 100, categoryId: 1 });
      component.submitInstallment();
      expect(creditCardServiceSpy.getBills).toHaveBeenCalledTimes(2); // init + reload
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.createInstallment.mockReturnValue(
        throwError(() => ({ error: { message: 'Fatura fechada' } }))
      );
      component.installmentForm.setValue({ amount: 100, categoryId: 1 });
      component.submitInstallment();
      expect(component.errorMessage()).toBeTruthy();
    });
  });

  // ─── tryCloseStep2 / warn modal ───────────────────────────────────────────

  describe('tryCloseStep2()', () => {
    beforeEach(() => setup());

    it('should open warn-close-mid-purchase modal', () => {
      component.currentPurchase.set(mockPurchase);
      component.activeModal.set('create-purchase-step2');
      component.tryCloseStep2();
      expect(component.activeModal()).toBe('warn-close-mid-purchase');
    });
  });

  describe('confirmCloseStep2()', () => {
    beforeEach(() => setup());

    it('should reset purchase state and close modal', () => {
      component.currentPurchase.set(mockPurchase);
      component.currentInstallmentIndex.set(2);
      component.confirmCloseStep2();
      expect(component.currentPurchase()).toBeNull();
      expect(component.currentInstallmentIndex()).toBe(1);
      expect(component.activeModal()).toBeNull();
    });
  });

  describe('cancelCloseStep2()', () => {
    beforeEach(() => setup());

    it('should return to step 2 modal', () => {
      component.activeModal.set('warn-close-mid-purchase');
      component.cancelCloseStep2();
      expect(component.activeModal()).toBe('create-purchase-step2');
    });
  });

  // ─── deletePurchaseFromStep2() ────────────────────────────────────────────

  describe('deletePurchaseFromStep2()', () => {
    beforeEach(() => setup());

    it('should delete purchase, reload bills and close modal', () => {
      component.currentPurchase.set(mockPurchase);
      component.deletePurchaseFromStep2();
      expect(creditCardServiceSpy.deletePurchase).toHaveBeenCalledWith(1, 100);
      expect(component.currentPurchase()).toBeNull();
      expect(component.activeModal()).toBeNull();
    });

    it('should return to step 2 on failure', () => {
      creditCardServiceSpy.deletePurchase.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.currentPurchase.set(mockPurchase);
      component.activeModal.set('warn-close-mid-purchase');
      component.deletePurchaseFromStep2();
      expect(component.activeModal()).toBe('create-purchase-step2');
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
});