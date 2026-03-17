import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CategoryService } from './category.service';
import { CategoryDto } from '../models/category.model';
import { environment } from '../../../environments/environment';

const base = environment.apiUrl;

const mockExpense: CategoryDto = { id: 1, name: 'Alimentação', type: 'EXPENSE', global: true };
const mockIncome: CategoryDto = { id: 2, name: 'Salário', type: 'INCOME', global: true };
const mockUserCategory: CategoryDto = { id: 3, name: 'Farmácia', type: 'EXPENSE', global: false };
const mockUserCategory2: CategoryDto = { id: 4, name: 'Freelance', type: 'INCOME', global: false };

describe('CategoryService', () => {
  let service: CategoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CategoryService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CategoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty categories', () => {
      expect(service.categories()).toEqual([]);
    });
  });

  // ─── loadCategories() ─────────────────────────────────────────────────────

  describe('loadCategories()', () => {
    it('should load and set categories signal', () => {
      service.loadCategories().subscribe();
      http.expectOne(`${base}/categories`).flush([mockExpense, mockIncome, mockUserCategory]);
      expect(service.categories()).toEqual([mockExpense, mockIncome, mockUserCategory]);
    });

    it('should include both global and user categories', () => {
      service.loadCategories().subscribe();
      http.expectOne(`${base}/categories`).flush([mockExpense, mockUserCategory]);
      expect(service.categories().some(c => c.global)).toBe(true);
      expect(service.categories().some(c => !c.global)).toBe(true);
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should POST and add created category to signal', () => {
      service.create({ name: 'Farmácia', type: 'EXPENSE' }).subscribe();
      http.expectOne(`${base}/categories`).flush(mockUserCategory);
      expect(service.categories()).toContainEqual(mockUserCategory);
    });

    it('should append to existing list', () => {
      service['_categories'].set([mockExpense, mockIncome]);
      service.create({ name: 'Farmácia', type: 'EXPENSE' }).subscribe();
      http.expectOne(`${base}/categories`).flush(mockUserCategory);
      expect(service.categories().length).toBe(3);
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should PATCH and replace category in signal', () => {
      service['_categories'].set([mockUserCategory, mockUserCategory2]);
      const updated = { ...mockUserCategory, name: 'Farmácia e Drogaria' };

      service.update(3, { name: 'Farmácia e Drogaria', type: 'EXPENSE' }).subscribe();
      http.expectOne(`${base}/categories/3`).flush(updated);

      expect(service.categories().find(c => c.id === 3)?.name).toBe('Farmácia e Drogaria');
      expect(service.categories().length).toBe(2);
    });

    it('should not affect other categories', () => {
      service['_categories'].set([mockUserCategory, mockUserCategory2]);
      const updated = { ...mockUserCategory, name: 'Atualizada' };

      service.update(3, { name: 'Atualizada', type: 'EXPENSE' }).subscribe();
      http.expectOne(`${base}/categories/3`).flush(updated);

      expect(service.categories().find(c => c.id === 4)).toEqual(mockUserCategory2);
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should DELETE and remove category from signal', () => {
      service['_categories'].set([mockUserCategory, mockUserCategory2]);

      service.delete(3).subscribe();
      http.expectOne(`${base}/categories/3`).flush(null);

      expect(service.categories().find(c => c.id === 3)).toBeUndefined();
      expect(service.categories().length).toBe(1);
    });

    it('should not remove other categories', () => {
      service['_categories'].set([mockUserCategory, mockUserCategory2]);

      service.delete(3).subscribe();
      http.expectOne(`${base}/categories/3`).flush(null);

      expect(service.categories()).toContainEqual(mockUserCategory2);
    });
  });
});