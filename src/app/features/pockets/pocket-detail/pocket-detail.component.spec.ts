import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PocketDetailComponent } from './pocket-detail.component';
import { PocketService } from '../../../core/services/pocket.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { CategoryService } from '../../../core/services/category.service';
import { PocketSummaryDto } from '../../../core/models/pocket.model';
import { TransactionDto } from '../../../core/models/transaction.model';
import { RouterTestingModule } from '@angular/router/testing';

const mockPocket: PocketSummaryDto = { id: 1, type: 'BANK_ACCOUNT', label: 'Banco X – Corrente', balance: 1500 };

const mockTransaction: TransactionDto = {
  id: 10,
  amount: 100,
  direction: 'EXPENSE',
  transactionDate: '2025-01-15',
  description: 'Conta de luz',
  category: { id: 1, name: 'Moradia', type: 'EXPENSE', isSystem: false },
};

const mockTransaction2: TransactionDto = {
  id: 11,
  amount: 500,
  direction: 'INCOME',
  transactionDate: '2025-01-10',
  description: 'Salário',
  category: { id: 9, name: 'Salário', type: 'INCOME', isSystem: false },
};

const mockCategories = [
  { id: 1, name: 'Moradia', type: 'EXPENSE' as const, isSystem: false },
  { id: 9, name: 'Salário', type: 'INCOME' as const, isSystem: false },
  { id: 11, name: 'Ajuste de Saldo', type: 'NEUTRAL' as const, isSystem: false },
];

function buildPocketService(pockets: PocketSummaryDto[] = [mockPocket]) {
  return {
    pockets: signal(pockets),
    loadPockets: jest.fn().mockReturnValue(of(pockets)),
  };
}

function buildTransactionService(transactions: TransactionDto[] = []) {
  return {
    transactions: signal(transactions),
    loadTransactions: jest.fn().mockReturnValue(of(transactions)),
    createTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    clearTransactions: jest.fn(),
  };
}

function buildCategoryService(categories = mockCategories) {
  return {
    categories: signal(categories),
    loadCategories: jest.fn().mockReturnValue(of(categories)),
  };
}

describe('PocketDetailComponent', () => {
  let fixture: ComponentFixture<PocketDetailComponent>;
  let component: PocketDetailComponent;
  let pocketServiceSpy: ReturnType<typeof buildPocketService>;
  let transactionServiceSpy: ReturnType<typeof buildTransactionService>;
  let categoryServiceSpy: ReturnType<typeof buildCategoryService>;
  let routerSpy: { navigate: jest.SpyInstance | jest.Mock };

  function setup(
    pockets: PocketSummaryDto[] = [mockPocket],
    transactions: TransactionDto[] = [],
    routeId = '1',
    categories = mockCategories // Adicione este parâmetro
  ) {
    pocketServiceSpy = buildPocketService(pockets);
    transactionServiceSpy = buildTransactionService(transactions);
    categoryServiceSpy = buildCategoryService(categories); // Use o parâmetro aqui

    TestBed.configureTestingModule({
      imports: [PocketDetailComponent, RouterTestingModule],
      providers: [
        { provide: PocketService, useValue: pocketServiceSpy },
        { provide: TransactionService, useValue: transactionServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeId } } } },
      ],
    });

    const router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
    routerSpy = { navigate: router.navigate as jest.Mock };

    fixture = TestBed.createComponent(PocketDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    it('should create the component', () => {
      setup();
      expect(component).toBeTruthy();
    });

    it('should load transactions on init', () => {
      setup();
      expect(transactionServiceSpy.loadTransactions).toHaveBeenCalledWith(1, undefined, undefined);
    });

    it('should set the pocket from the pockets signal', () => {
      setup();
      expect(component.pocket()).toEqual(mockPocket);
    });

    it('should navigate to /pockets if pocket not found', () => {
      setup([{ id: 99, type: 'CASH', label: 'Outro', balance: 0 }], [], '1');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/pockets']);
    });

    it('should call loadPockets if signal is empty', () => {
      const emptyPocketService = buildPocketService([]);
      emptyPocketService.loadPockets = jest.fn().mockReturnValue(of([mockPocket]));
      emptyPocketService.pockets = signal([]);

      TestBed.configureTestingModule({
        imports: [PocketDetailComponent, RouterTestingModule],
        providers: [
          { provide: PocketService, useValue: emptyPocketService },
          { provide: TransactionService, useValue: buildTransactionService() },
          { provide: CategoryService, useValue: buildCategoryService() },
          { provide: Router, useValue: { navigate: jest.fn() } },
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        ],
      });
      fixture = TestBed.createComponent(PocketDetailComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(emptyPocketService.loadPockets).toHaveBeenCalled();
    });

    it('should call loadCategories if categories signal is empty', () => {
      setup([mockPocket], [], '1', []);
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalled();
    });

    it('should clear transactions on destroy', () => {
      setup();
      component.ngOnDestroy();
      expect(transactionServiceSpy.clearTransactions).toHaveBeenCalled();
    });
  });

  // ─── groupedTransactions() ────────────────────────────────────────────────

  describe('groupedTransactions()', () => {
    it('should return empty array when no transactions', () => {
      setup([mockPocket], []);
      expect(component.groupedTransactions()).toEqual([]);
    });

    it('should group transactions by date, most recent first', () => {
      setup([mockPocket], [mockTransaction, mockTransaction2]);
      const groups = component.groupedTransactions();
      expect(groups.length).toBe(2);
      expect(groups[0].date).toBe('2025-01-15');
      expect(groups[1].date).toBe('2025-01-10');
    });

    it('should group multiple transactions on the same date together', () => {
      const tx3: TransactionDto = { ...mockTransaction, id: 12, transactionDate: '2025-01-15' };
      setup([mockPocket], [mockTransaction, tx3]);
      const groups = component.groupedTransactions();
      expect(groups.length).toBe(1);
      expect(groups[0].items.length).toBe(2);
    });
  });

  // ─── availableCategories() ────────────────────────────────────────────────

  describe('availableCategories()', () => {
    it('should return EXPENSE and NEUTRAL categories when direction is EXPENSE', () => {
      setup();
      component.createDirection.set('EXPENSE');
      const names = component.availableCategories().map(c => c.name);
      expect(names).toContain('Moradia');
      expect(names).toContain('Ajuste de Saldo');
      expect(names).not.toContain('Salário');
    });

    it('should return INCOME and NEUTRAL categories when direction is INCOME', () => {
      setup();
      component.createDirection.set('INCOME');
      const names = component.availableCategories().map(c => c.name);
      expect(names).toContain('Salário');
      expect(names).toContain('Ajuste de Saldo');
      expect(names).not.toContain('Moradia');
    });
  });

  // ─── applyFilter() ────────────────────────────────────────────────────────

  describe('applyFilter()', () => {
    beforeEach(() => setup());

    it('should call loadTransactions with the filter dates', () => {
      component.filterForm.setValue({ startDate: '2025-01-01', endDate: '2025-01-31' });
      component.applyFilter();
      expect(transactionServiceSpy.loadTransactions).toHaveBeenCalledWith(1, '2025-01-01', '2025-01-31');
    });

    it('should set filterError when startDate is after endDate', () => {
      component.filterForm.setValue({ startDate: '2025-02-01', endDate: '2025-01-01' });
      component.applyFilter();
      expect(component.filterError()).toBeTruthy();
      expect(transactionServiceSpy.loadTransactions).toHaveBeenCalledTimes(1); // apenas o do init
    });

    it('should clear filterError on valid filter', () => {
      component.filterError.set('erro anterior');
      component.filterForm.setValue({ startDate: '2025-01-01', endDate: '2025-01-31' });
      component.applyFilter();
      expect(component.filterError()).toBeNull();
    });
  });

  // ─── clearFilter() ────────────────────────────────────────────────────────

  describe('clearFilter()', () => {
    beforeEach(() => setup());

    it('should reset filter form and reload transactions', () => {
      component.filterForm.setValue({ startDate: '2025-01-01', endDate: '2025-01-31' });
      component.clearFilter();
      expect(component.filterForm.value).toEqual({ startDate: '', endDate: '' });
      expect(transactionServiceSpy.loadTransactions).toHaveBeenLastCalledWith(1, undefined, undefined);
    });

    it('should clear filterError', () => {
      component.filterError.set('algum erro');
      component.clearFilter();
      expect(component.filterError()).toBeNull();
    });
  });

  // ─── openCreateModal() ────────────────────────────────────────────────────

  describe('openCreateModal()', () => {
    beforeEach(() => setup());

    it('should open create modal', () => {
      component.openCreateModal();
      expect(component.activeModal()).toBe('create');
    });

    it('should reset direction to EXPENSE', () => {
      component.createDirection.set('INCOME');
      component.openCreateModal();
      expect(component.createDirection()).toBe('EXPENSE');
    });

    it('should clear errorMessage', () => {
      component.errorMessage.set('algum erro');
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── openDeleteConfirm() ──────────────────────────────────────────────────

  describe('openDeleteConfirm()', () => {
    beforeEach(() => setup());

    it('should open confirm-delete modal and set selectedTransaction', () => {
      component.openDeleteConfirm(mockTransaction);
      expect(component.activeModal()).toBe('confirm-delete');
      expect(component.selectedTransaction()).toEqual(mockTransaction);
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup());

    it('should close modal and clear state', () => {
      component.openDeleteConfirm(mockTransaction);
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedTransaction()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── setDirection() ───────────────────────────────────────────────────────

  describe('setDirection()', () => {
    beforeEach(() => setup());

    it('should update createDirection signal', () => {
      component.setDirection('INCOME');
      expect(component.createDirection()).toBe('INCOME');
    });

    it('should reset categoryId in the form', () => {
      component.createForm.patchValue({ categoryId: 1 });
      component.setDirection('INCOME');
      expect(component.createForm.value.categoryId).toBeNull();
    });
  });

  // ─── onCreateTransaction() ────────────────────────────────────────────────

  describe('onCreateTransaction()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.onCreateTransaction();
      expect(transactionServiceSpy.createTransaction).not.toHaveBeenCalled();
      expect(component.createForm.touched).toBe(true);
    });

    it('should call createTransaction with correct payload and close modal', () => {
      transactionServiceSpy.createTransaction.mockReturnValue(of(mockTransaction));
      component.createForm.setValue({
        amount: 100,
        transactionDate: '2025-01-15',
        description: 'Conta de luz',
        categoryId: 1,
      });
      component.createDirection.set('EXPENSE');
      component.onCreateTransaction();
      expect(transactionServiceSpy.createTransaction).toHaveBeenCalledWith(1, {
        direction: 'EXPENSE',
        amount: 100,
        transactionDate: '2025-01-15',
        description: 'Conta de luz',
        categoryId: 1,
      });
      expect(component.activeModal()).toBeNull();
    });

    it('should reload transactions after creating', () => {
      transactionServiceSpy.createTransaction.mockReturnValue(of(mockTransaction));
      component.createForm.setValue({
        amount: 100, transactionDate: '2025-01-15',
        description: 'Conta de luz', categoryId: 1,
      });
      component.onCreateTransaction();
      expect(transactionServiceSpy.loadTransactions).toHaveBeenCalledTimes(2);
    });

    it('should set errorMessage on failure', () => {
      transactionServiceSpy.createTransaction.mockReturnValue(
        throwError(() => ({ error: { message: 'Categoria inválida' } }))
      );
      component.createForm.setValue({
        amount: 100, transactionDate: '2025-01-15',
        description: 'Conta de luz', categoryId: 1,
      });
      component.onCreateTransaction();
      expect(component.errorMessage()).toBe('Categoria inválida');
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── deleteTransaction() ──────────────────────────────────────────────────

  describe('deleteTransaction()', () => {
    beforeEach(() => setup());

    it('should do nothing if no transaction is selected', () => {
      component.deleteTransaction();
      expect(transactionServiceSpy.deleteTransaction).not.toHaveBeenCalled();
    });

    it('should call deleteTransaction and close modal on success', () => {
      transactionServiceSpy.deleteTransaction.mockReturnValue(of(undefined));
      component.openDeleteConfirm(mockTransaction);
      component.deleteTransaction();
      expect(transactionServiceSpy.deleteTransaction).toHaveBeenCalledWith(1, mockTransaction.id);
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      transactionServiceSpy.deleteTransaction.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro ao excluir' } }))
      );
      component.openDeleteConfirm(mockTransaction);
      component.deleteTransaction();
      expect(component.errorMessage()).toBe('Erro ao excluir');
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  describe('formatCurrency()', () => {
    beforeEach(() => setup());

    it('should format value as BRL currency', () => {
      expect(component.formatCurrency(1500)).toContain('1.500');
    });

    it('should handle undefined gracefully', () => {
      expect(() => component.formatCurrency(undefined)).not.toThrow();
    });
  });

  describe('formatGroupDate()', () => {
    beforeEach(() => setup());

    it('should return "Hoje" for today', () => {
      const today = new Date();
      const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(component.formatGroupDate(str)).toBe('Hoje');
    });

    it('should return "Ontem" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const str = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(component.formatGroupDate(str)).toBe('Ontem');
    });

    it('should return formatted date for older dates', () => {
      const result = component.formatGroupDate('2020-06-15');
      expect(result).toContain('2020');
      expect(result).toContain('15');
    });
  });

  describe('getPocketTypeLabel()', () => {
    beforeEach(() => setup());

    it('should return correct label for each type', () => {
      expect(component.getPocketTypeLabel('BANK_ACCOUNT')).toBe('Conta Bancária');
      expect(component.getPocketTypeLabel('BENEFIT_ACCOUNT')).toBe('Conta de Benefício');
      expect(component.getPocketTypeLabel('FGTS_EMPLOYER_ACCOUNT')).toBe('FGTS');
      expect(component.getPocketTypeLabel('CASH')).toBe('Carteira');
    });

    it('should return empty string for unknown type', () => {
      expect(component.getPocketTypeLabel('UNKNOWN')).toBe('');
    });
  });
});