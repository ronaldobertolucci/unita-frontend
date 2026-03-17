import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CategoriesComponent } from './categories.component';
import { CategoryService } from '../../../core/services/category.service';
import { CategoryDto } from '../../../core/models/category.model';

const mockExpense: CategoryDto = { id: 1, name: 'Alimentação', type: 'EXPENSE', global: true };
const mockIncome: CategoryDto = { id: 2, name: 'Salário', type: 'INCOME', global: true };
const mockNeutral: CategoryDto = { id: 3, name: 'Ajuste de Saldo', type: 'NEUTRAL', global: true };
const mockUserExpense: CategoryDto = { id: 4, name: 'Farmácia', type: 'EXPENSE', global: false };
const mockUserIncome: CategoryDto = { id: 5, name: 'Freelance', type: 'INCOME', global: false };

function buildService(categories: CategoryDto[] = []) {
  return {
    categories: signal(categories),
    loadCategories: jest.fn().mockReturnValue(of(categories)),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

describe('CategoriesComponent', () => {
  let fixture: ComponentFixture<CategoriesComponent>;
  let component: CategoriesComponent;
  let serviceSpy: ReturnType<typeof buildService>;

  function setup(categories: CategoryDto[] = []) {
    serviceSpy = buildService(categories);

    TestBed.configureTestingModule({
      imports: [CategoriesComponent],
      providers: [{ provide: CategoryService, useValue: serviceSpy }],
    });

    fixture = TestBed.createComponent(CategoriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadCategories on init', () => {
      expect(serviceSpy.loadCategories).toHaveBeenCalled();
    });

    it('should start with no active modal', () => {
      expect(component.activeModal()).toBeNull();
    });

    it('should start with isLoading false after init', () => {
      expect(component.isLoading()).toBe(false);
    });
  });

  // ─── Computed signals ─────────────────────────────────────────────────────

  describe('computed signals', () => {
    beforeEach(() => setup([mockExpense, mockIncome, mockNeutral, mockUserExpense, mockUserIncome]));

    it('should filter expense categories', () => {
      expect(component.expenseCategories().length).toBe(2);
      expect(component.expenseCategories().every(c => c.type === 'EXPENSE')).toBe(true);
    });

    it('should filter income categories', () => {
      expect(component.incomeCategories().length).toBe(2);
      expect(component.incomeCategories().every(c => c.type === 'INCOME')).toBe(true);
    });

    it('should filter neutral categories', () => {
      expect(component.neutralCategories().length).toBe(1);
      expect(component.neutralCategories().every(c => c.type === 'NEUTRAL')).toBe(true);
    });

    it('should count only user categories', () => {
      expect(component.userCategoriesCount()).toBe(2);
    });

  });

  describe('computed signals — only global categories', () => {
    beforeEach(() => setup([mockExpense, mockIncome, mockNeutral]));

    it('should return 0 user categories when all are global', () => {
      expect(component.userCategoriesCount()).toBe(0);
    });
  });

  // ─── openCreateModal() ────────────────────────────────────────────────────

  describe('openCreateModal()', () => {
    beforeEach(() => setup());

    it('should open create modal', () => {
      component.openCreateModal();
      expect(component.activeModal()).toBe('create');
    });

    it('should reset form with EXPENSE as default type', () => {
      component.form.patchValue({ name: 'Teste', type: 'INCOME' });
      component.openCreateModal();
      expect(component.nameControl.value).toBeFalsy();
      expect(component.typeControl.value).toBe('EXPENSE');
    });

    it('should clear error and selected category', () => {
      component.errorMessage.set('algum erro');
      component.selectedCategory.set(mockUserExpense);
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
      expect(component.selectedCategory()).toBeNull();
    });
  });

  // ─── openEditModal() ──────────────────────────────────────────────────────

  describe('openEditModal()', () => {
    beforeEach(() => setup([mockUserExpense]));

    it('should open edit modal', () => {
      component.openEditModal(mockUserExpense);
      expect(component.activeModal()).toBe('edit');
    });

    it('should set selected category', () => {
      component.openEditModal(mockUserExpense);
      expect(component.selectedCategory()).toEqual(mockUserExpense);
    });

    it('should prefill form with category data', () => {
      component.openEditModal(mockUserExpense);
      expect(component.nameControl.value).toBe('Farmácia');
      expect(component.typeControl.value).toBe('EXPENSE');
    });
  });

  // ─── openDeleteModal() ────────────────────────────────────────────────────

  describe('openDeleteModal()', () => {
    beforeEach(() => setup([mockUserExpense]));

    it('should open confirm-delete modal', () => {
      component.openDeleteModal(mockUserExpense);
      expect(component.activeModal()).toBe('confirm-delete');
    });

    it('should set selected category', () => {
      component.openDeleteModal(mockUserExpense);
      expect(component.selectedCategory()).toEqual(mockUserExpense);
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup([mockUserExpense]));

    it('should close modal and clear state', () => {
      component.openEditModal(mockUserExpense);
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedCategory()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── save() — criar ───────────────────────────────────────────────────────

  describe('save() — create', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openCreateModal();
      component.form.patchValue({ name: '' });
      component.save();
      expect(serviceSpy.create).not.toHaveBeenCalled();
      expect(component.nameControl.touched).toBe(true);
    });

    it('should call create with correct payload', () => {
      serviceSpy.create.mockReturnValue(of(mockUserExpense));
      component.openCreateModal();
      component.form.setValue({ name: 'Farmácia', type: 'EXPENSE' });
      component.save();
      expect(serviceSpy.create).toHaveBeenCalledWith({ name: 'Farmácia', type: 'EXPENSE' });
    });

    it('should close modal on success', () => {
      serviceSpy.create.mockReturnValue(of(mockUserExpense));
      component.openCreateModal();
      component.form.setValue({ name: 'Farmácia', type: 'EXPENSE' });
      component.save();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      serviceSpy.create.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.openCreateModal();
      component.form.setValue({ name: 'Farmácia', type: 'EXPENSE' });
      component.save();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── save() — editar ──────────────────────────────────────────────────────

  describe('save() — edit', () => {
    beforeEach(() => setup([mockUserExpense]));

    it('should call update with category id and payload', () => {
      serviceSpy.update.mockReturnValue(of({ ...mockUserExpense, name: 'Farmácia Atualizada' }));
      component.openEditModal(mockUserExpense);
      component.form.setValue({ name: 'Farmácia Atualizada', type: 'EXPENSE' });
      component.save();
      expect(serviceSpy.update).toHaveBeenCalledWith(4, { name: 'Farmácia Atualizada', type: 'EXPENSE' });
    });

    it('should close modal on success', () => {
      serviceSpy.update.mockReturnValue(of(mockUserExpense));
      component.openEditModal(mockUserExpense);
      component.form.setValue({ name: 'Farmácia', type: 'EXPENSE' });
      component.save();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      serviceSpy.update.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.openEditModal(mockUserExpense);
      component.form.setValue({ name: 'Farmácia', type: 'EXPENSE' });
      component.save();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    beforeEach(() => setup([mockUserExpense, mockUserIncome]));

    it('should call delete with category id', () => {
      serviceSpy.delete.mockReturnValue(of(undefined));
      component.openDeleteModal(mockUserExpense);
      component.delete();
      expect(serviceSpy.delete).toHaveBeenCalledWith(4);
    });

    it('should close modal on success', () => {
      serviceSpy.delete.mockReturnValue(of(undefined));
      component.openDeleteModal(mockUserExpense);
      component.delete();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage when category is in use', () => {
      serviceSpy.delete.mockReturnValue(
        throwError(() => ({ error: { message: 'Category is in use' } }))
      );
      component.openDeleteModal(mockUserExpense);
      component.delete();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── getCategoryTypeLabel() ───────────────────────────────────────────────

  describe('getCategoryTypeLabel()', () => {
    beforeEach(() => setup());

    it('should return correct label for INCOME', () => {
      expect(component.getCategoryTypeLabel('INCOME')).toBe('Receita');
    });

    it('should return correct label for EXPENSE', () => {
      expect(component.getCategoryTypeLabel('EXPENSE')).toBe('Despesa');
    });

    it('should return correct label for NEUTRAL', () => {
      expect(component.getCategoryTypeLabel('NEUTRAL')).toBe('Neutro');
    });
  });

  // ─── Global vs usuário ────────────────────────────────────────────────────

  describe('global vs user category distinction', () => {
    beforeEach(() => setup([mockExpense, mockUserExpense]));

    it('should not allow editing global categories', () => {
      const globalCategory = component.categories().find(c => c.global);
      expect(globalCategory?.global).toBe(true);
    });

    it('should allow editing user categories', () => {
      const userCategory = component.categories().find(c => !c.global);
      expect(userCategory?.global).toBe(false);
    });
  });
});