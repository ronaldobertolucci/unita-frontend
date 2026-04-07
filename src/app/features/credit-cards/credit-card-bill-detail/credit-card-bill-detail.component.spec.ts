import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { CreditCardBillDetailComponent } from './credit-card-bill-detail.component';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { CategoryService } from '../../../core/services/category.service';
import {
  CreditCardBillDto,
  CreditCardPurchaseDto,
  BillStatementDto,
  BillInstallmentItem,
  BillRefundItem,
  CreditCardRefundDto,
} from '../../../core/models/credit-card.model';
import { CategoryDto } from '../../../core/models/category.model';

const mockBillOpen: CreditCardBillDto = {
  id: 10, closingDate: '2025-04-15', dueDate: '2025-04-22',
  status: 'OPEN', totalInstallments: 300, totalRefunds: 0, totalAmount: 300,
};

const mockBillPaid: CreditCardBillDto = {
  id: 10, closingDate: '2025-04-15', dueDate: '2025-04-22',
  status: 'PAID', totalInstallments: 300, totalRefunds: 0, totalAmount: 300,
};

const mockPurchase: CreditCardPurchaseDto = {
  id: 100, description: 'Geladeira', totalValue: 300,
  purchaseDate: '2025-04-01', installmentsCount: 3,
};

const mockExpenseCategory: CategoryDto = { id: 1, name: 'Alimentação', type: 'EXPENSE', global: false };
const mockIncomeCategory: CategoryDto = { id: 9, name: 'Ajuste de Saldo', type: 'NEUTRAL', global: true };

const mockInstallmentItem: BillInstallmentItem = {
  id: 200, description: 'Geladeira', amount: 100,
  purchaseDate: '2025-04-01', installmentNumber: 1, totalInstallments: 3,
  category: { id: 1, name: 'Alimentação', type: 'EXPENSE', isSystem: false },
};

const mockRefundItem: BillRefundItem = {
  id: 300, description: 'Estorno X', amount: 50,
  refundDate: '2025-04-05',
  category: { id: 9, name: 'Ajuste de Saldo', type: 'NEUTRAL', isSystem: true },
};

const mockStatement: BillStatementDto = {
  installments: [mockInstallmentItem],
  refunds: [mockRefundItem],
};

const mockRefundDto: CreditCardRefundDto = {
  id: 300, 
  description: 'Estorno X',
  amount: 50,
  refundDate: '2025-04-05',
  category: { id: 9, name: 'Ajuste de Saldo', type: 'NEUTRAL', isSystem: true },
};

function buildCreditCardService() {
  return {
    getBill: jest.fn().mockReturnValue(of(mockBillOpen)),
    getBillStatement: jest.fn().mockReturnValue(of(mockStatement)),
    getPurchases: jest.fn().mockReturnValue(of([mockPurchase])),
    createRefund: jest.fn().mockReturnValue(of(mockRefundDto)),
    deleteRefund: jest.fn().mockReturnValue(of(undefined)),
    deletePurchase: jest.fn().mockReturnValue(of(undefined)),
    createInstallment: jest.fn(),
  };
}

function buildCategoryService(categories: CategoryDto[] = []) {
  return {
    categories: signal(categories),
    loadCategories: jest.fn().mockReturnValue(of(categories)),
  };
}

describe('CreditCardBillDetailComponent', () => {
  let fixture: ComponentFixture<CreditCardBillDetailComponent>;
  let component: CreditCardBillDetailComponent;
  let creditCardServiceSpy: ReturnType<typeof buildCreditCardService>;
  let categoryServiceSpy: ReturnType<typeof buildCategoryService>;

  function setup(categories: CategoryDto[] = [mockExpenseCategory, mockIncomeCategory]) {
    creditCardServiceSpy = buildCreditCardService();
    categoryServiceSpy = buildCategoryService(categories);

    TestBed.configureTestingModule({
      imports: [CreditCardBillDetailComponent, RouterTestingModule],
      providers: [
        { provide: CreditCardService, useValue: creditCardServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (key: string) => key === 'id' ? '1' : '10' } } },
        },
      ],
    });

    fixture = TestBed.createComponent(CreditCardBillDetailComponent);
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

    it('should load bill, statement and purchases on init', () => {
      expect(creditCardServiceSpy.getBill).toHaveBeenCalledWith(1, 10);
      expect(creditCardServiceSpy.getBillStatement).toHaveBeenCalledWith(1, 10);
      expect(creditCardServiceSpy.getPurchases).toHaveBeenCalledWith(1);
    });

    it('should set bill signal', () => {
      expect(component.bill()).toEqual(mockBillOpen);
    });

    it('should set installments and refunds from statement', () => {
      expect(component.installments()).toEqual(mockStatement.installments);
      expect(component.refunds()).toEqual(mockStatement.refunds);
    });

    it('should not reload categories if already cached', () => {
      expect(categoryServiceSpy.loadCategories).not.toHaveBeenCalled();
    });
  });

  describe('initialization — categories empty', () => {
    it('should load categories if signal is empty', () => {
      setup([]);
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalled();
    });
  });

  // ─── displayItems() ───────────────────────────────────────────────────────

  describe('displayItems()', () => {
    beforeEach(() => setup());

    it('should combine installments and refunds', () => {
      expect(component.displayItems().length).toBe(2);
    });

    it('should mark installments as type installment', () => {
      const inst = component.displayItems().find(i => i.type === 'installment');
      expect(inst).toBeDefined();
      expect(inst!.description).toBe('Geladeira');
    });

    it('should mark refunds as type refund', () => {
      const ref = component.displayItems().find(i => i.type === 'refund');
      expect(ref).toBeDefined();
      expect(ref!.description).toBe('Estorno X');
    });

    it('should sort by date descending', () => {
      const dates = component.displayItems().map(i => i.date);
      expect(dates).toEqual([...dates].sort().reverse());
    });
  });

  // ─── expenseCategories / incomeCategories ─────────────────────────────────

  describe('incomeCategories()', () => {
    beforeEach(() => setup());

    it('should include INCOME and NEUTRAL categories', () => {
      const types = component.incomeCategories().map(c => c.type);
      expect(types.every(t => t === 'INCOME' || t === 'NEUTRAL')).toBe(true);
    });
  });

  // ─── isPaid ───────────────────────────────────────────────────────────────

  describe('isPaid', () => {
    it('should return false for OPEN bill', () => {
      setup();
      expect(component.isPaid).toBe(false);
    });

    it('should return true for PAID bill', () => {
      setup();
      creditCardServiceSpy.getBill.mockReturnValue(of(mockBillPaid));
      component.bill.set(mockBillPaid);
      expect(component.isPaid).toBe(true);
    });
  });

  // ─── openCreateRefundModal() ──────────────────────────────────────────────

  describe('openCreateRefundModal()', () => {
    beforeEach(() => setup());

    it('should set activeModal to create-refund', () => {
      component.openCreateRefundModal();
      expect(component.activeModal()).toBe('create-refund');
    });

    it('should reset refundForm with today as date', () => {
      component.openCreateRefundModal();
      expect(component.refundForm.value.refundDate).toBeTruthy();
    });
  });

  // ─── submitRefund() ───────────────────────────────────────────────────────

  describe('submitRefund()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openCreateRefundModal();
      component.submitRefund();
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
    });

    it('should create refund, append to signal and refresh bill', () => {
      creditCardServiceSpy.getBill.mockReturnValue(of({ ...mockBillOpen, totalRefunds: 50, totalAmount: 250 }));
      component.openCreateRefundModal();
      component.refundForm.setValue({
        description: 'Estorno X', amount: 50,
        refundDate: '2025-04-05', categoryId: 9,
      });
      component.submitRefund();
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledWith(1, 10, {
        description: 'Estorno X', amount: 50,
        refundDate: '2025-04-05', categoryId: 9,
      });
      expect(component.refunds().length).toBe(2);
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.createRefund.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.openCreateRefundModal();
      component.refundForm.setValue({
        description: 'Estorno X', amount: 50,
        refundDate: '2025-04-05', categoryId: 9,
      });
      component.submitRefund();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── openDeletePurchaseConfirm() ──────────────────────────────────────────

  describe('openDeletePurchaseConfirm()', () => {
    beforeEach(() => setup());

    it('should set modal and selection signals', () => {
      component.openDeletePurchaseConfirm(100, 'Geladeira', 3);
      expect(component.activeModal()).toBe('confirm-delete-purchase');
      expect(component.selectedPurchaseId()).toBe(100);
      expect(component.selectedPurchaseDescription()).toBe('Geladeira');
      expect(component.selectedPurchaseTotalInstallments()).toBe(3);
    });
  });

  // ─── deletePurchase() ─────────────────────────────────────────────────────

  describe('deletePurchase()', () => {
    beforeEach(() => setup());

    it('should delete purchase, reload statement and close modal', () => {
      creditCardServiceSpy.getBill.mockReturnValue(of(mockBillOpen));
      component.selectedPurchaseId.set(100);
      component.deletePurchase();
      expect(creditCardServiceSpy.deletePurchase).toHaveBeenCalledWith(1, 100);
      expect(creditCardServiceSpy.getBillStatement).toHaveBeenCalledTimes(2); // init + reload
      expect(component.purchases().find(p => p.id === 100)).toBeUndefined();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.deletePurchase.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.selectedPurchaseId.set(100);
      component.deletePurchase();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── openDeleteRefundConfirm() ────────────────────────────────────────────

  describe('openDeleteRefundConfirm()', () => {
    beforeEach(() => setup());

    it('should set modal and selection signals', () => {
      component.openDeleteRefundConfirm(300, 'Estorno X');
      expect(component.activeModal()).toBe('confirm-delete-refund');
      expect(component.selectedRefundId()).toBe(300);
      expect(component.selectedRefundDescription()).toBe('Estorno X');
    });
  });

  // ─── deleteRefund() ───────────────────────────────────────────────────────

  describe('deleteRefund()', () => {
    beforeEach(() => setup());

    it('should delete refund, update signal and refresh bill', () => {
      creditCardServiceSpy.getBill.mockReturnValue(of(mockBillOpen));
      component.selectedRefundId.set(300);
      component.deleteRefund();
      expect(creditCardServiceSpy.deleteRefund).toHaveBeenCalledWith(1, 10, 300);
      expect(component.refunds().find(r => r.id === 300)).toBeUndefined();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.deleteRefund.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.selectedRefundId.set(300);
      component.deleteRefund();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup());

    it('should clear all modal state', () => {
      component.selectedPurchaseId.set(100);
      component.selectedRefundId.set(300);
      component.errorMessage.set('erro');
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedPurchaseId()).toBeNull();
      expect(component.selectedRefundId()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  describe('formatCurrency()', () => {
    beforeEach(() => setup());

    it('should format value as BRL', () => {
      expect(component.formatCurrency(300)).toContain('300');
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
});