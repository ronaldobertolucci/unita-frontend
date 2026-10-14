import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError, Subject, BehaviorSubject } from 'rxjs';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
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
  installments: [{ id: 200, installmentNumber: 1, amount: 100, creditCardBillId: 10, installmentDate: '2025-04-01',
    billDueDate: '2025-04-22', category: { id: 1, name: 'Alimentação', type: 'EXPENSE', global: false } }],
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
  purchaseId: null,
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
  purchaseId: null,
  category: { id: 9, name: 'Ajuste de Saldo', type: 'NEUTRAL', isSystem: true },
};

function buildCreditCardService() {
  return {
    getBills: jest.fn().mockReturnValue(of([mockBillOpen])),
    getInstallments: jest.fn().mockReturnValue(of([{ ...mockInstallmentItem, creditCardBillId: 10, installmentDate: '2025-04-01', billDueDate: '2025-04-22' }])),
    updateInstallment: jest.fn().mockReturnValue(of({ ...mockInstallmentItem, creditCardBillId: 10, installmentDate: '2025-04-01', billDueDate: '2025-04-22' })),
    reopenBill: jest.fn().mockReturnValue(of(mockBillOpen)),
    getBill: jest.fn().mockReturnValue(of(mockBillOpen)),
    getRefunds: jest.fn().mockReturnValue(of([mockRefundDto])),
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
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function setup(categories: CategoryDto[] = [mockExpenseCategory, mockIncomeCategory]) {
    creditCardServiceSpy = buildCreditCardService();
    categoryServiceSpy = buildCategoryService(categories);
    routeParams = new BehaviorSubject(convertToParamMap({ id: '1', billId: '10' }));

    TestBed.configureTestingModule({
      imports: [CreditCardBillDetailComponent, RouterTestingModule],
      providers: [
        { provide: CreditCardService, useValue: creditCardServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: routeParams },
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

    it('should create refund and reload the authoritative list, statement and totals', () => {
      creditCardServiceSpy.getBill.mockReturnValue(of({ ...mockBillOpen, totalRefunds: 50, totalAmount: 250 }));
      component.openCreateRefundModal();
      component.refundForm.setValue({
        description: 'Estorno X', amount: 50,
        refundDate: '2025-04-05', categoryId: 9, creditCardBillId: 10, purchaseId: null,
      });
      component.submitRefund();
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledWith(1, 10, {
        description: 'Estorno X', amount: 50,
        refundDate: '2025-04-05', categoryId: 9,
      });
      expect(component.refunds()).toEqual([mockRefundDto]);
      expect(creditCardServiceSpy.getRefunds).toHaveBeenCalledWith(1, 10);
      expect(creditCardServiceSpy.getBillStatement).toHaveBeenCalledTimes(2);
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.createRefund.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } }))
      );
      component.openCreateRefundModal();
      component.refundForm.setValue({
        description: 'Estorno X', amount: 50,
        refundDate: '2025-04-05', categoryId: 9, creditCardBillId: 10, purchaseId: null,
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
      creditCardServiceSpy.getPurchases.mockReturnValue(of([]));
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
      creditCardServiceSpy.getRefunds.mockReturnValue(of([]));
      creditCardServiceSpy.getBillStatement.mockReturnValue(of({ ...mockStatement, refunds: [] }));
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
  describe('US-05 lifecycle', () => {
    beforeEach(() => setup());

    it.each(['OPEN', 'CLOSED', 'PAID'] as const)('permits movement from %s only to OPEN, preserving amount', source => {
      component.bill.set({ ...mockBillOpen, status: source });
      for (const destination of ['OPEN', 'CLOSED', 'PAID'] as const) {
        component.bills.set([mockBillOpen, { ...mockBillOpen, id: 11, status: destination }]);
        creditCardServiceSpy.updateInstallment.mockClear();
        component.openMoveModal(component.displayItems().find(i => i.type === 'installment')!);
        component.moveForm.setValue({ creditCardBillId: 11 });
        component.moveInstallment();
        if (source === 'OPEN' && destination === 'OPEN') {
          expect(creditCardServiceSpy.updateInstallment).toHaveBeenCalledWith(1, 100, 200, { amount: 100, creditCardBillId: 11 });
        } else {
          expect(creditCardServiceSpy.updateInstallment).not.toHaveBeenCalled();
        }
        component.bill.set({ ...mockBillOpen, status: source });
      }
    });

    it('allows same-bill movement and reloads the date returned by the server', () => {
      creditCardServiceSpy.getPurchases.mockReturnValue(of([{ ...mockPurchase, installments: [{ ...mockPurchase.installments[0], installmentDate: '2025-03-15' }] }]));
      component.openMoveModal(component.displayItems().find(i => i.type === 'installment')!);
      component.moveInstallment();
      expect(creditCardServiceSpy.updateInstallment).toHaveBeenCalledWith(1, 100, 200, { amount: 100, creditCardBillId: 10 });
      expect(component.displayItems().find(i => i.id === 200)?.date).toBe('2025-03-15');
      expect(creditCardServiceSpy.getBills).toHaveBeenCalledTimes(2);
    });

    it.each(['CLOSED', 'PAID'] as const)('blocks refunds and purchase deletion with %s bills', status => {
      component.bill.set({ ...mockBillOpen, status });
      component.bills.set([{ ...mockBillOpen, status }]);
      component.openCreateRefundModal();
      component.submitRefund();
      component.openDeleteRefundConfirm(300, 'Estorno X');
      component.selectedRefundId.set(300);
      component.deleteRefund();
      component.selectedPurchaseId.set(100);
      component.deletePurchase();
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
      expect(creditCardServiceSpy.deleteRefund).not.toHaveBeenCalled();
      expect(creditCardServiceSpy.deletePurchase).not.toHaveBeenCalled();
    });

    it('blocks purchase deletion if any installment is protected or its bill is unknown', () => {
      component.purchaseInstallments.update(lists => ({ ...lists, 100: [...lists[100], { ...lists[100][0], id: 201, creditCardBillId: 11 }] }));
      expect(component.canDeletePurchase(100)).toBe(false);
      component.bills.update(list => [...list, { ...mockBillPaid, id: 11 }]);
      expect(component.canDeletePurchase(100)).toBe(false);
    });

    it('resolves identical purchase descriptions by installment ID', () => {
      component.purchases.update(list => [{ ...mockPurchase, id: 101 }, ...list]);
      component.purchaseInstallments.update(lists => ({ ...lists, 101: [{ ...lists[100][0], id: 201 }] }));
      expect(component.displayItems().find(i => i.id === 200)?.purchaseId).toBe(100);
    });

    it('reopens CLOSED explicitly and never reopens PAID', () => {
      component.bill.set({ ...mockBillOpen, status: 'CLOSED' });
      component.reopenBill();
      expect(creditCardServiceSpy.reopenBill).toHaveBeenCalledWith(1, 10);
      expect(component.canChangeComposition()).toBe(true);
      component.bill.set(mockBillPaid);
      component.reopenBill();
      expect(creditCardServiceSpy.reopenBill).toHaveBeenCalledTimes(1);
    });

    it('reloads composition on conflict without repeating the movement', () => {
      creditCardServiceSpy.updateInstallment.mockReturnValue(throwError(() => ({ status: 409, error: { message: 'Bill composition is protected. Only open bills without a payment can be changed' } })));
      component.openMoveModal(component.displayItems().find(i => i.type === 'installment')!);
      component.moveInstallment();
      expect(creditCardServiceSpy.updateInstallment).toHaveBeenCalledTimes(1);
      expect(creditCardServiceSpy.getPurchases).toHaveBeenCalledTimes(2);
      expect(creditCardServiceSpy.getInstallments).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('protegida');
    });
  });

  it('prevents double click and dismissal while movement is pending', () => {
    setup();
    const response = new Subject<any>();
    creditCardServiceSpy.updateInstallment.mockReturnValue(response);
    component.openMoveModal(component.displayItems().find(i => i.type === 'installment')!);
    component.moveInstallment();
    component.moveInstallment();
    component.closeModal();
    expect(creditCardServiceSpy.updateInstallment).toHaveBeenCalledTimes(1);
    expect(component.activeModal()).toBe('move-installment');
    response.next({ ...mockInstallmentItem, creditCardBillId: 10, installmentDate: '2025-04-01' });
    response.complete();
    expect(component.activeModal()).toBeNull();
  });

  it('renders explicit reopening and disables composition actions in CLOSED', () => {
    setup();
    component.bill.set({ ...mockBillOpen, status: 'CLOSED' });
    component.bills.set([{ ...mockBillOpen, status: 'CLOSED' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reabrir fatura');
    expect(fixture.nativeElement.textContent).not.toContain('Novo estorno');
    const buttons = fixture.nativeElement.querySelectorAll('.item-delete-btn');
    expect([...buttons].every((button: any) => button.disabled)).toBe(true);
  });

  describe('US-06 refund integration', () => {
    const target = { ...mockBillOpen, id: 11, dueDate: '2026-11-20' };
    const fillRefund = (overrides: object = {}) => component.refundForm.setValue({
      description: 'Devolução parcial', amount: '50,00', refundDate: '2026-10-14',
      categoryId: 9, creditCardBillId: 10, purchaseId: null, ...overrides,
    });
    beforeEach(() => setup());

    it('requires an explicit destination even when only one open bill is available', () => {
      component.openCreateRefundModal();
      expect(component.refundForm.value.creditCardBillId).toBeNull();
      fillRefund({ creditCardBillId: null });
      component.submitRefund();
      expect(component.refundFieldError('creditCardBillId')).toBe('Obrigatório.');
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
    });

    it('credits an explicitly selected OPEN destination for a purchase in a PAID bill', () => {
      creditCardServiceSpy.getBill.mockImplementation((_card, id) => of(id === 11 ? target : mockBillPaid));
      creditCardServiceSpy.getBills.mockReturnValue(of([mockBillPaid, target]));
      creditCardServiceSpy.getBillStatement.mockImplementation((_card, id) => of(id === 11
        ? { installments: [], refunds: [{ ...mockRefundItem, purchaseId: 100 }] } : mockStatement));
      component.bill.set(mockBillPaid);
      component.bills.set([mockBillPaid, target]);
      component.openCreateRefundModal();
      fillRefund({ creditCardBillId: 11, purchaseId: 100 });
      component.submitRefund();
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledWith(1, 11, {
        description: 'Devolução parcial', amount: 50, refundDate: '2026-10-14', categoryId: 9, purchaseId: 100,
      });
      expect(component.bill()).toEqual(mockBillPaid);
      expect(component.purchases()).toEqual([mockPurchase]);
      expect(component.savedRefundBill()).toEqual(target);
      expect(creditCardServiceSpy.getBill).toHaveBeenCalledWith(1, 11);
      expect(creditCardServiceSpy.getRefunds).toHaveBeenCalledWith(1, 11);
      expect(creditCardServiceSpy.getBillStatement).toHaveBeenCalledWith(1, 11);
      expect(creditCardServiceSpy.updateInstallment).not.toHaveBeenCalled();
      expect(creditCardServiceSpy.reopenBill).not.toHaveBeenCalled();
    });

    it.each([{ status: 'CLOSED' }, { status: 'PAID' }, { status: 'OPEN', paymentId: 88 }])(
      'rejects protected destinations %p', protectedFields => {
        component.openCreateRefundModal();
        component.bills.update(list => [...list, { ...target, ...protectedFields } as CreditCardBillDto]);
        fillRefund({ creditCardBillId: 11 });
        component.submitRefund();
        expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
      });

    it('offers only available INCOME and NEUTRAL categories', () => {
      categoryServiceSpy.categories.update(list => [...list, { id: 12, name: 'Estornos', type: 'INCOME', global: false }]);
      component.openCreateRefundModal();
      expect(component.refundCategories().map(c => c.id).sort()).toEqual([12, 9]);
      fillRefund({ categoryId: 1 });
      component.submitRefund();
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
    });

    it('never sends an unavailable purchase reference', () => {
      component.openCreateRefundModal();
      fillRefund({ purchaseId: 999 });
      component.submitRefund();
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
      expect(component.refundForm.value.purchaseId).toBe(999);
    });

    it.each(['0', '-1', '1.001', '1e2', '10000000000000', '9999999999999.999', ''])('rejects invalid money %s without rounding', amount => {
      component.openCreateRefundModal(); fillRefund({ amount }); component.submitRefund();
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
      expect(component.refundForm.value.amount).toBe(amount);
    });

    it('accepts the maximum supported amount without rounding', () => {
      component.openCreateRefundModal(); fillRefund({ amount: '9999999999999,99' }); component.submitRefund();
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledWith(1, 10, expect.objectContaining({ amount: 9999999999999.99 }));
    });

    it.each([{ description: '   ' }, { description: 'a'.repeat(256) }, { refundDate: '2026-02-30' }])('rejects invalid fields %p', fields => {
      component.openCreateRefundModal(); fillRefund(fields); component.submitRefund();
      expect(creditCardServiceSpy.createRefund).not.toHaveBeenCalled();
    });

    it('preserves the selected purchase and destination after an accumulated-limit rejection', () => {
      creditCardServiceSpy.createRefund.mockReturnValue(throwError(() => ({ status: 400, error: {
        message: 'amount: accumulated refunds must not exceed purchase totalValue',
      } })));
      component.openCreateRefundModal(); fillRefund({ purchaseId: 100 }); component.submitRefund();
      expect(component.errorMessage()).toContain('incluindo outras faturas');
      expect(component.refundForm.value.purchaseId).toBe(100);
      expect(component.refundForm.value.creditCardBillId).toBe(10);
      expect(component.refundForm.value.amount).toBe('50,00');
      expect(creditCardServiceSpy.getRefunds).toHaveBeenCalledWith(1, 10);
      expect(creditCardServiceSpy.getPurchases.mock.calls.length).toBeGreaterThan(2);
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
    });

    it('shows field validation returned by the server without changing the entered amount', () => {
      creditCardServiceSpy.createRefund.mockReturnValue(throwError(() => ({ status: 400, error: {
        error: 'Validation Failed', message: 'Invalid input data', errors: [{ field: 'amount', message: 'invalid precision' }],
      } })));
      component.openCreateRefundModal(); fillRefund(); component.submitRefund();
      expect(component.refundFieldError('amount')).toContain('duas casas');
      expect(component.refundForm.value.amount).toBe('50,00');
      component.refundForm.patchValue({ amount: '40,00' });
      expect(component.refundFieldError('amount')).toBeNull();
    });

    it('reloads a conflicting destination and never repeats the POST automatically', () => {
      component.openCreateRefundModal(); fillRefund();
      creditCardServiceSpy.createRefund.mockReturnValue(throwError(() => ({ status: 409, error: {
        message: 'Bill composition is protected. Only open bills without a payment can be changed',
      } })));
      creditCardServiceSpy.getBills.mockReturnValue(of([mockBillPaid]));
      creditCardServiceSpy.getBill.mockReturnValue(of(mockBillPaid));
      component.submitRefund(); component.submitRefund();
      expect(component.bill()?.status).toBe('PAID');
      expect(component.refundForm.value.creditCardBillId).toBe(10);
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
      expect(component.errorMessage()).toContain('protegida');
    });

    it('refreshes selectors on 404 without dropping an unavailable reference', () => {
      component.openCreateRefundModal(); fillRefund({ purchaseId: 100 });
      creditCardServiceSpy.createRefund.mockReturnValue(throwError(() => ({ status: 404 })));
      creditCardServiceSpy.getPurchases.mockReturnValue(of([]));
      component.submitRefund(); component.submitRefund();
      expect(component.purchases()).toEqual([]);
      expect(component.refundForm.value.purchaseId).toBe(100);
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalledTimes(2);
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
    });

    it.each([0, 503, 500])('requires refund reconciliation after an uncertain HTTP %s', status => {
      const check = jest.spyOn(component.financialRecovery, 'check').mockImplementation(() => {});
      component.openCreateRefundModal(); fillRefund({ purchaseId: 100 });
      creditCardServiceSpy.createRefund.mockReturnValue(throwError(() => ({ status, error: { error: 'Concurrency Timeout' } })));
      component.submitRefund(); component.financialRecovery.confirm(); component.submitRefund();
      expect(check).toHaveBeenCalled();
      expect(component.financialRecovery.operation()).toEqual(expect.objectContaining({ billId: 10, reviewRefunds: true }));
      expect(component.financialRecovery.state()).toBe('pending');
      expect(creditCardServiceSpy.getRefunds).toHaveBeenCalledWith(1, 10);
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
      expect(component.refundForm.value.purchaseId).toBe(100);
    });

    it('blocks double submit and dismissal while the POST is pending', () => {
      const response = new Subject<CreditCardRefundDto>();
      creditCardServiceSpy.createRefund.mockReturnValue(response);
      component.openCreateRefundModal(); fillRefund();
      component.submitRefund(); component.submitRefund(); component.closeModal();
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
      expect(component.activeModal()).toBe('create-refund');
      response.next(mockRefundDto); response.complete();
      expect(component.activeModal()).toBeNull();
    });

    it('blocks another submission if refreshing a confirmed refund fails', () => {
      jest.spyOn(component.financialRecovery, 'check').mockImplementation(() => {});
      component.openCreateRefundModal(); fillRefund();
      creditCardServiceSpy.getRefunds.mockReturnValue(throwError(() => ({ status: 503 })));
      component.submitRefund(); component.openCreateRefundModal(); component.submitRefund();
      expect(component.errorMessage()).toContain('Estorno registrado');
      expect(component.compositionReady()).toBe(false);
      expect(component.financialRecovery.state()).toBe('pending');
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
    });

    it('displays nullable references and blocks deletion of a known linked purchase', () => {
      component.refunds.set([{ ...mockRefundItem, purchaseId: 100 }, { ...mockRefundItem, id: 301, purchaseId: null }]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Compra #100');
      expect(fixture.nativeElement.textContent).toContain('Sem compra vinculada');
      component.openDeletePurchaseConfirm(100, 'Geladeira', 3);
      expect(component.activeModal()).toBeNull();
      expect(component.canDeletePurchase(100)).toBe(false);
    });

    it('explains a linked-purchase conflict from another bill and preserves the purchase', () => {
      creditCardServiceSpy.deletePurchase.mockReturnValue(throwError(() => ({ status: 409, error: {
        message: 'Purchase is referenced by refunds and cannot be changed or deleted',
      } })));
      component.openDeletePurchaseConfirm(100, 'Geladeira', 3); component.deletePurchase();
      expect(component.errorMessage()).toContain('estornos vinculados');
      expect(component.purchases()).toEqual([mockPurchase]);
      expect(creditCardServiceSpy.getPurchases).toHaveBeenCalledTimes(2);
    });

    it.each([0, -40])('keeps a nonpositive CLOSED bill closed and explains the balance %s', totalAmount => {
      component.bill.set({ ...mockBillOpen, status: 'CLOSED', totalAmount, totalRefunds: 340 });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(totalAmount < 0 ? 'Saldo credor' : 'Fatura zerada');
      expect(fixture.nativeElement.querySelector('.bill-status-badge--closed')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.bill-status-badge--paid')).toBeNull();
    });

    it('keeps uncertain refund deletion blocked until its list and statement are reviewed', () => {
      jest.spyOn(component.financialRecovery, 'check').mockImplementation(() => {});
      creditCardServiceSpy.deleteRefund.mockReturnValue(throwError(() => ({ status: 0 })));
      component.openDeleteRefundConfirm(300, 'Estorno X');
      component.deleteRefund(); component.financialRecovery.confirm(); component.deleteRefund();
      expect(component.financialRecovery.operation()).toEqual(expect.objectContaining({ billId: 10, reviewRefunds: true }));
      expect(component.financialRecovery.state()).toBe('pending');
      expect(creditCardServiceSpy.getRefunds).toHaveBeenCalledWith(1, 10);
      expect(creditCardServiceSpy.deleteRefund).toHaveBeenCalledTimes(1);
    });

    it('renders installments and positive credits in separate sections', () => {
      fixture.detectChanges();
      const sections = fixture.nativeElement.querySelectorAll('.statement-section');
      expect(sections.length).toBe(2);
      expect(sections[0].getAttribute('aria-label')).toBe('Parcelas');
      expect(sections[0].textContent).toContain('Geladeira');
      expect(sections[0].textContent).not.toContain('Estorno X');
      expect(sections[1].getAttribute('aria-label')).toBe('Créditos de estorno');
      expect(sections[1].textContent).toContain('Estorno X');
    });

    it('reconciles a pending refund when navigation reuses the component', () => {
      jest.spyOn(component.financialRecovery, 'check').mockImplementation(() => {});
      const response = new Subject<CreditCardRefundDto>();
      creditCardServiceSpy.createRefund.mockReturnValue(response);
      component.openCreateRefundModal(); fillRefund(); component.submitRefund();
      routeParams.next(convertToParamMap({ id: '1', billId: '11' }));
      expect(component.isSaving()).toBe(false);
      expect(component.activeModal()).toBeNull();
      expect(component.financialRecovery.state()).toBe('pending');
      expect(component.financialRecovery.operation()).toEqual(expect.objectContaining({ billId: 10, reviewRefunds: true }));
      response.next(mockRefundDto); response.complete();
      expect(component.savedRefundBill()).toBeNull();
      expect(creditCardServiceSpy.createRefund).toHaveBeenCalledTimes(1);
    });

    it('loads the selected destination when navigating between bills in the same component', () => {
      creditCardServiceSpy.getBill.mockReturnValue(of(target));
      routeParams.next(convertToParamMap({ id: '1', billId: '11' }));
      expect(component.billId).toBe(11);
      expect(component.bill()).toEqual(target);
      expect(creditCardServiceSpy.getBillStatement).toHaveBeenCalledWith(1, 11);
    });
  });

});