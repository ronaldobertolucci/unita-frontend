import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../core/services/category.service';
import { CategoryDto, CategoryType } from '../../../core/models/category.model';
import { translateApiError } from '../../../core/utils/api-error.util';

type ModalType = 'create' | 'edit' | 'confirm-delete' | null;

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.css',
})
export class CategoriesComponent implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado ───────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedCategory = signal<CategoryDto | null>(null);

  // ─── Dados ────────────────────────────────────────────────────────────────

  readonly categories = this.categoryService.categories;

  readonly incomeCategories = computed(() =>
    this.categories().filter(c => c.type === 'INCOME')
  );

  readonly expenseCategories = computed(() =>
    this.categories().filter(c => c.type === 'EXPENSE')
  );

  readonly neutralCategories = computed(() =>
    this.categories().filter(c => c.type === 'NEUTRAL')
  );

  readonly userCategoriesCount = computed(() =>
    this.categories().filter(c => !c.global).length
  );

  // ─── Formulário ───────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['EXPENSE' as CategoryType, Validators.required],
  });

  get nameControl() { return this.form.get('name')!; }
  get typeControl() { return this.form.get('type')!; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.categoryService.loadCategories().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  getCategoryTypeLabel(type: CategoryType): string {
    const labels: Record<CategoryType, string> = {
      INCOME: 'Receita',
      EXPENSE: 'Despesa',
      NEUTRAL: 'Neutro',
    };
    return labels[type];
  }

  // ─── Modais ───────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.form.reset({ name: '', type: 'EXPENSE' });
    this.errorMessage.set(null);
    this.selectedCategory.set(null);
    this.activeModal.set('create');
  }

  openEditModal(category: CategoryDto): void {
    this.selectedCategory.set(category);
    this.errorMessage.set(null);
    this.form.patchValue({ name: category.name, type: category.type });
    this.activeModal.set('edit');
  }

  openDeleteModal(category: CategoryDto): void {
    this.selectedCategory.set(category);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedCategory.set(null);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const payload = {
      name: this.form.value.name!,
      type: this.form.value.type as CategoryType,
    };

    const request$ = this.activeModal() === 'edit'
      ? this.categoryService.update(this.selectedCategory()!.id, payload)
      : this.categoryService.create(payload);

    request$.subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao salvar categoria.'));
      },
    });
  }

  delete(): void {
    const category = this.selectedCategory();
    if (!category) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.categoryService.delete(category.id).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir. Verifique se a categoria não está em uso.'));
      },
    });
  }
}