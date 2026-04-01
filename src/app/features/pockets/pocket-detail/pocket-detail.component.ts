import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';

import { PocketService } from '../../../core/services/pocket.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { CategoryService } from '../../../core/services/category.service';
import { PocketSummaryDto } from '../../../core/models/pocket.model';
import { TransactionDto } from '../../../core/models/transaction.model';

type ModalType = 'create' | 'confirm-delete' | null;

@Component({
  selector: 'app-pocket-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './pocket-detail.component.html',
  styleUrl: './pocket-detail.component.css'
})
export class PocketDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly pocketService = inject(PocketService);
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);

  private pocketId!: number;

  // ─── State ───────────────────────────────────────────────────────
  readonly pocket = signal<PocketSummaryDto | null>(null);
  readonly isLoading = signal(true);
  readonly isLoadingTx = signal(false);
  readonly isSaving = signal(false);
  readonly activeModal = signal<ModalType>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly filterError = signal<string | null>(null);
  readonly selectedTransaction = signal<TransactionDto | null>(null);
  readonly createDirection = signal<'INCOME' | 'EXPENSE'>('EXPENSE');

  // ─── Forms ───────────────────────────────────────────────────────
  readonly filterForm = this.fb.group({
    startDate: [''],
    endDate: ['']
  });

  readonly createForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    transactionDate: [this.todayString(), Validators.required],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    categoryId: [null as number | null, Validators.required]
  });

  // ─── Computed ────────────────────────────────────────────────────
  readonly transactions = this.transactionService.transactions;

  readonly groupedTransactions = computed(() => {
    const map = new Map<string, TransactionDto[]>();
    for (const tx of this.transactions()) {
      const group = map.get(tx.transactionDate) ?? [];
      map.set(tx.transactionDate, [...group, tx]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({ date, items }));
  });

  readonly availableCategories = computed(() =>
    this.categoryService.categories()
      .filter(c => c.type === this.createDirection() || c.type === 'NEUTRAL')
      .sort((a, b) => a.name.localeCompare('pt-BR'))
  );

  // ─── Lifecycle ───────────────────────────────────────────────────
  ngOnInit(): void {
    this.pocketId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadPageData();
  }

  ngOnDestroy(): void {
    this.transactionService.clearTransactions();
  }

  // ─── Carregamento inicial ─────────────────────────────────────────
  private loadPageData(): void {
    this.isLoading.set(true);

    const afterPockets = () => {
      const found = this.pocketService.pockets().find(p => p.id === this.pocketId);
      if (!found) { this.router.navigate(['/pockets']); return; }
      this.pocket.set(found);

      if (this.categoryService.categories().length === 0) {
        this.categoryService.loadCategories().subscribe({
          next: () => { this.isLoading.set(false); this.fetchTransactions(); },
          error: () => { this.isLoading.set(false); this.router.navigate(['/pockets']); }
        });
      } else {
        this.isLoading.set(false);
        this.fetchTransactions();
      }
    };

    if (this.pocketService.pockets().length === 0) {
      this.pocketService.loadPockets().subscribe({
        next: () => afterPockets(),
        error: () => { this.isLoading.set(false); this.router.navigate(['/pockets']); }
      });
    } else {
      afterPockets();
    }
  }

  private fetchTransactions(): void {
    this.isLoadingTx.set(true);
    const { startDate, endDate } = this.filterForm.value;

    this.transactionService.loadTransactions(
      this.pocketId,
      startDate || undefined,
      endDate || undefined
    ).subscribe({
      next: () => this.isLoadingTx.set(false),
      error: () => this.isLoadingTx.set(false)
    });
  }

  // ─── Filtro ──────────────────────────────────────────────────────
  applyFilter(): void {
    const { startDate, endDate } = this.filterForm.value;
    if (startDate && endDate && startDate > endDate) {
      this.filterError.set('A data inicial não pode ser posterior à data final.');
      return;
    }
    this.filterError.set(null);
    this.fetchTransactions();
  }

  clearFilter(): void {
    this.filterForm.reset({ startDate: '', endDate: '' });
    this.filterError.set(null);
    this.fetchTransactions();
  }

  // ─── Modal ───────────────────────────────────────────────────────
  openCreateModal(): void {
    this.createForm.reset({
      amount: null,
      transactionDate: this.todayString(),
      description: '',
      categoryId: null
    });
    this.createDirection.set('EXPENSE');
    this.errorMessage.set(null);
    this.activeModal.set('create');
  }

  openDeleteConfirm(tx: TransactionDto): void {
    this.selectedTransaction.set(tx);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedTransaction.set(null);
  }

  // ─── Toggle de direção ───────────────────────────────────────────
  setDirection(dir: 'INCOME' | 'EXPENSE'): void {
    this.createDirection.set(dir);
    this.createForm.patchValue({ categoryId: null });
  }

  // ─── Ações ───────────────────────────────────────────────────────
  onCreateTransaction(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    const { amount, transactionDate, description, categoryId } = this.createForm.value;

    this.transactionService.createTransaction(this.pocketId, {
      direction: this.createDirection(),
      amount: amount!,
      transactionDate: transactionDate!,
      description: description!,
      categoryId: categoryId!
    }).subscribe({
      next: () => {
        this.fetchTransactions();
        this.refreshPocketBalance();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Erro ao registrar transação.');
      }
    });
  }

  deleteTransaction(): void {
    const tx = this.selectedTransaction();
    if (!tx) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.transactionService.deleteTransaction(this.pocketId, tx.id).subscribe({
      next: () => {
        this.refreshPocketBalance();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Erro ao excluir transação.');
      }
    });
  }

  private refreshPocketBalance(): void {
    this.pocketService.loadPockets().subscribe({
      next: () => {
        const updated = this.pocketService.pockets().find(p => p.id === this.pocketId);
        if (updated) this.pocket.set(updated);
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────
  private todayString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatCurrency(value: number | undefined): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
  }

  formatGroupDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Hoje';
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  getPocketTypeLabel(type: string | undefined): string {
    const labels: Record<string, string> = {
      BANK_ACCOUNT: 'Conta Bancária',
      BENEFIT_ACCOUNT: 'Conta de Benefício',
      FGTS_EMPLOYER_ACCOUNT: 'FGTS',
      CASH: 'Carteira'
    };
    return labels[type ?? ''] ?? '';
  }

  getCategoryTypeLabel(type: 'INCOME' | 'EXPENSE' | 'NEUTRAL'): string {
    const labels = { INCOME: 'Receita', EXPENSE: 'Despesa', NEUTRAL: 'Neutra' };
    return labels[type];
  }

  get amountControl() { return this.createForm.get('amount')!; }
  get descriptionControl() { return this.createForm.get('description')!; }
  get categoryControl() { return this.createForm.get('categoryId')!; }
  get dateControl() { return this.createForm.get('transactionDate')!; }
}