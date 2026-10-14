import { financialErrorMessage, isUncertainFinancialWrite, transactionProtectionMessage } from '../../../core/utils/financial-operation.util';
import { FinancialRecoveryService } from '../../../core/services/financial-recovery.service';
import { FinancialRecoveryComponent } from '../../../shared/financial-recovery/financial-recovery.component';
import { Component, OnDestroy, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  imports: [FinancialRecoveryComponent, CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './pocket-detail.component.html',
  styleUrl: './pocket-detail.component.css'
})
export class PocketDetailComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  readonly financialRecovery = inject(FinancialRecoveryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly pocketService = inject(PocketService);
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);

  private pocketId!: number;

  // ─── Parâmetros de retorno ────────────────────────────────────────
  // Preserva o filtro de tipo que veio da listagem via query param.
  readonly backQueryParams = {
    type: this.route.snapshot.queryParamMap.get('type'),
  };

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

  private readonly EXPENSE_EXCLUDED = new Set([
    'Resgate de Investimento',
    'Rendimento de Investimento',
    'Transferência Recebida'
  ]);

  private readonly INCOME_EXCLUDED = new Set([
    'Aporte em Investimento',
    'Pagamento de Cartão',
    'Transferência Enviada'
  ]);

  // ─── Computed ────────────────────────────────────────────────────
  readonly transactions = this.transactionService.transactions;
  private readonly blockedTransactionIds = signal(new Set<number>());
  canDeleteTransaction(tx: TransactionDto): boolean {
    return tx.canDelete !== false && !this.blockedTransactionIds().has(tx.id);
  }
  protectionMessage(tx: TransactionDto): string {
    return transactionProtectionMessage({ ...tx, canDelete: false });
  }
  readonly selectedCanDelete = computed(() => {
    const selected = this.selectedTransaction();
    const current = this.transactions().find(tx => tx.id === selected?.id) ?? selected;
    return !!current && this.canDeleteTransaction(current);
  });

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

  readonly availableCategories = computed(() => {
    const excluded = this.createDirection() === 'EXPENSE'
      ? this.EXPENSE_EXCLUDED
      : this.INCOME_EXCLUDED;

    return this.categoryService.categories()
      .filter(c =>
        (c.type === this.createDirection() || c.type === 'NEUTRAL') &&
        !excluded.has(c.name)
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

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
      if (!found) {
        this.router.navigate(['/pockets'], { queryParams: this.backQueryParams });
        return;
      }
      this.pocket.set(found);

      if (this.categoryService.categories().length === 0) {
        this.categoryService.loadCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => { this.isLoading.set(false); this.fetchTransactions(); },
          error: () => {
            this.isLoading.set(false);
            this.router.navigate(['/pockets'], { queryParams: this.backQueryParams });
          }
        });
      } else {
        this.isLoading.set(false);
        this.fetchTransactions();
      }
    };

    if (this.pocketService.pockets().length === 0) {
      this.pocketService.loadPockets().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => afterPockets(),
        error: () => {
          this.isLoading.set(false);
          this.router.navigate(['/pockets'], { queryParams: this.backQueryParams });
        }
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
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    if (!this.canDeleteTransaction(tx) || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
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
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    const { amount, transactionDate, description, categoryId } = this.createForm.value;

    this.financialRecovery.trackWrite({ label: `Registro: ${description}`, pocketIds: [this.pocketId] }, this.transactionService.createTransaction(this.pocketId, {
      direction: this.createDirection(),
      amount: amount!,
      transactionDate: transactionDate!,
      description: description!,
      categoryId: categoryId!
    })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.fetchTransactions();
        this.refreshPocketBalance();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.handleWriteError(err, `Registro: ${description}`, 'Erro ao registrar transação.');
      }
    });
  }

  deleteTransaction(): void {
    const tx = this.selectedTransaction();
    if (!tx || !this.selectedCanDelete() || this.isSaving() || this.financialRecovery.state() !== 'clear') return;

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.financialRecovery.trackWrite({ label: `Exclusão: ${tx.description}`, pocketIds: [this.pocketId] }, this.transactionService.deleteTransaction(this.pocketId, tx.id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.fetchTransactions();
        this.refreshPocketBalance();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.handleWriteError(err, `Exclusão: ${tx.description}`, 'Erro ao excluir transação.');
      }
    });
  }

  private handleWriteError(error: any, label: string, fallback: string): void {
    if (error.status === 409 && this.selectedTransaction()) {
      this.blockedTransactionIds.update(ids => new Set([...ids, this.selectedTransaction()!.id]));
    }
    if (isUncertainFinancialWrite(error)) {
      this.closeModal();
      this.financialRecovery.mark({ label, pocketIds: [this.pocketId] });
      this.financialRecovery.check();
    } else {
      this.errorMessage.set(financialErrorMessage(error, 'transaction', fallback));
    }
    this.fetchTransactions();
    this.refreshPocketBalance();
  }

  private refreshPocketBalance(): void {
    this.pocketService.getBalance(this.pocketId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: balance => this.pocket.update(p => p ? { ...p, balance } : p),
      error: () => {},
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
      BANK_ACCOUNT:           'Conta Bancária',
      BENEFIT_ACCOUNT:        'Conta de Benefício',
      FGTS_EMPLOYER_ACCOUNT:  'FGTS',
      CASH:                   'Carteira'
    };
    return labels[type ?? ''] ?? '';
  }

  getCategoryTypeLabel(type: 'INCOME' | 'EXPENSE' | 'NEUTRAL'): string {
    const labels = { INCOME: 'Receita', EXPENSE: 'Despesa', NEUTRAL: 'Neutra' };
    return labels[type];
  }

  get amountControl()      { return this.createForm.get('amount')!; }
  get descriptionControl() { return this.createForm.get('description')!; }
  get categoryControl()    { return this.createForm.get('categoryId')!; }
  get dateControl()        { return this.createForm.get('transactionDate')!; }
}