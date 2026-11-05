import { Component, OnInit, signal, computed, effect, inject, DestroyRef } from '@angular/core';
import { Observable, finalize, forkJoin, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';

import { TransactionService } from '../../../core/services/transaction.service';
import { redemptionNet, investmentUnits, investmentQuantityText, proportionalSaleValue } from '../../../core/utils/investment-redemption.util';
import { AssetService } from '../../../core/services/asset.service';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { CategoryService } from '../../../core/services/category.service';
import { PocketService } from '../../../core/services/pocket.service';
import {
  AssetDetailDto,
  InvestmentTransactionDto,
  InvestmentTransactionType,
  LiquidityType,
} from '../../../core/models/asset.model';
import { translateApiError } from '../../../core/utils/api-error.util';
import { financialWriteErrorMessage, isUncertainFinancialWrite } from '../../../core/utils/financial-operation.util';
import { FinancialRecoveryService } from '../../../core/services/financial-recovery.service';
import { FinancialRecoveryComponent } from '../../../shared/financial-recovery/financial-recovery.component';

type ModalType =
  | 'edit'
  | 'update-position'
  | 'buy'
  | 'yield'
  | 'sell'
  | 'confirm-delete'
  | null;

// Nomes das categorias de sistema usadas em investimentos
const CATEGORY_BUY = 'Aporte em Investimento';
const CATEGORY_YIELD = 'Rendimento de Investimento';
const CATEGORY_SELL = 'Resgate de Investimento';

@Component({
  selector: 'app-investment-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, FinancialRecoveryComponent],
  templateUrl: './investment-detail.component.html',
  styleUrl: './investment-detail.component.css',
})
export class InvestmentDetailComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly assetService = inject(AssetService);
  readonly legalEntityService = inject(LegalEntityService);
  readonly categoryService = inject(CategoryService);
  readonly pocketService = inject(PocketService);
  readonly transactionService = inject(TransactionService);
  readonly financialRecovery = inject(FinancialRecoveryService);

  // ── Parâmetros de retorno ─────────────────────────────────────────────────
  readonly backQueryParams = {
    custodian: this.route.snapshot.queryParamMap.get('custodian'),
  };

  // ── State ─────────────────────────────────────────────────────────────────
  readonly asset = signal<AssetDetailDto | null>(null);
  readonly transactions = signal<InvestmentTransactionDto[]>([]);
  readonly isLoading = signal(true);
  readonly isLoadingTransactions = signal(false);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');

  readonly sellNeedsReview = signal(false);
  readonly sellReviewLoaded = signal(false);
  readonly sellRefreshing = signal(false);
  readonly sellPocketId = signal<number | null>(null);
  readonly sellBalance = signal<number | null>(null);
  private assetId!: number;

  constructor() {
    let hadPendingSale = false;
    effect(() => {
      const pendingSale = !!this.financialRecovery.operation()?.sale;
      if (hadPendingSale && this.financialRecovery.state() === 'clear') this.sellNeedsReview.set(false);
      hadPendingSale = pendingSale;
      const review = this.financialRecovery.investment();
      if (review && review.asset.id === this.assetId) {
        this.asset.set(review.asset);
        this.transactions.set([...review.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)));
      }
    });
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly variation = computed(() => {
    const a = this.asset();
    if (!a || !a.position.totalInvested) return 0;
    const reference =
      a.status === 'REDEEMED' ? a.position.redeemedValue : a.position.currentValue;
    return ((reference - a.position.totalInvested) / a.position.totalInvested) * 100;
  });

  readonly displayCurrentValue = computed(() => {
    const a = this.asset();
    if (!a) return 0;
    return a.status === 'REDEEMED' ? a.position.redeemedValue : a.position.currentValue;
  });

  readonly eligiblePockets = computed(() =>
    this.pocketService
      .pockets()
      .filter((p) => p.type === 'BANK_ACCOUNT' || p.type === 'CASH'),
  );

  private readonly categoryBuy = computed(() =>
    this.categoryService.categories().find((c) => c.name === CATEGORY_BUY),
  );
  private readonly categoryYield = computed(() =>
    this.categoryService.categories().find((c) => c.name === CATEGORY_YIELD),
  );
  readonly sellCategories = computed(() =>
    this.categoryService.categories().filter(c => c.type === 'INCOME' || c.type === 'NEUTRAL'),
  );

  private readonly categorySell = computed(() =>
    this.sellCategories().find((c) => c.name === CATEGORY_SELL),
  );

  // ── Forms ─────────────────────────────────────────────────────────────────
  editForm!: FormGroup;
  positionForm!: FormGroup;
  buyForm!: FormGroup;
  yieldForm!: FormGroup;
  sellForm!: FormGroup;
  private sellFormChanges = new Subscription();
  private sellGrossEdited = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.assetId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadAll();

    this.legalEntityService.loadLegalEntities().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.categoryService.loadCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.pocketService.loadPockets().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private loadAll(): void {
    this.isLoading.set(true);
    this.assetService.getAsset(this.assetId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.asset.set(data);
        this.isLoading.set(false);
        this.loadTransactions();
      },
      error: () => {
        this.isLoading.set(false);
        // Retorna para a listagem preservando o filtro
        this.router.navigate(['/investments'], { queryParams: this.backQueryParams });
      },
    });
  }

  private loadTransactions(): void {
    this.isLoadingTransactions.set(true);
    this.assetService.getTransactions(this.assetId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.transactions.set(
          [...data].sort(
            (a, b) =>
              new Date(b.transactionDate).getTime() -
              new Date(a.transactionDate).getTime(),
          ),
        );
        this.isLoadingTransactions.set(false);
      },
      error: () => this.isLoadingTransactions.set(false),
    });
  }

  // ── Helpers de exibição ───────────────────────────────────────────────────
  statusLabel(status: string): string {
    const map: Record<string, string> = {
      ACTIVE: 'Ativo',
      MATURED: 'Vencido',
      REDEEMED: 'Resgatado',
    };
    return map[status] ?? status;
  }

  categoryLabel(category: string): string {
    switch (category) {
      case 'RENDA_FIXA': return 'Renda Fixa';
      case 'PREVIDENCIA': return 'Previdência';
      default: return 'Categoria não reconhecida';
    }
  }

  transactionLabel(type: InvestmentTransactionType): string {
    const map: Record<InvestmentTransactionType, string> = {
      BUY: 'Aporte',
      SELL: 'Resgate',
      YIELD: 'Rendimento resgatado',
      TAX: 'Imposto',
    };
    return map[type];
  }

  isCredit(type: InvestmentTransactionType): boolean {
    return type === 'BUY';
  }

  isDebit(type: InvestmentTransactionType): boolean {
    return type === 'SELL' || type === 'TAX' || type === 'YIELD';
  }

  pensionTypeLabel(type: string): string {
    const map: Record<string, string> = {
      PGBL: 'PGBL',
      VGBL: 'VGBL',
      ENTIDADE_FECHADA: 'Entidade Fechada',
    };
    return map[type] ?? type;
  }

  taxRegimeLabel(regime: string): string {
    const map: Record<string, string> = {
      PROGRESSIVO: 'Progressivo',
      REGRESSIVO: 'Regressivo',
    };
    return map[regime] ?? regime;
  }

  readonly liquidityTypes = ['DIARIA', 'MERCADO', 'NO_VENCIMENTO', 'PRAZO_FIXO', 'PREVIDENCIARIA'] as const;

  readonly liquidityTypeLabels: Record<string, string> = {
    DIARIA:         'Diária',
    MERCADO:        'Mercado secundário',
    NO_VENCIMENTO:  'No vencimento',
    PRAZO_FIXO:     'Prazo fixo',
    PREVIDENCIARIA: 'Previdenciária',
  };

  liquidityTypeLabel(type: string | null | undefined): string {
    if (!type) return '—';
    return this.liquidityTypeLabels[type] ?? type;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openModal(type: ModalType): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear' || (type === 'sell' && !this.canSell())) return;
    this.errorMessage.set('');
    this.activeModal.set(type);

    if (type === 'edit') this.buildEditForm();
    if (type === 'update-position') this.buildPositionForm();
    if (type === 'buy') this.buildBuyForm();
    if (type === 'yield') this.buildYieldForm();
    if (type === 'sell') this.buildSellForm();
  }

  closeModal(): void {
    if (this.isSaving()) return;
    this.activeModal.set(null);
    this.errorMessage.set('');
  }

  // ── Submits ───────────────────────────────────────────────────────────────
  onEdit(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { name, legalEntityId, custodianLegalEntityId, liquidityType } = this.editForm.value;

    this.assetService
      .updateAsset(this.assetId, {
        name: name.trim(),
        legalEntityId: Number(legalEntityId),
        custodianLegalEntityId: custodianLegalEntityId ? Number(custodianLegalEntityId) : null,
        liquidityType: liquidityType || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.asset.set(updated);
          this.isSaving.set(false);
          this.closeModal();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  onUpdatePosition(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.positionForm.markAllAsTouched();
    if (this.positionForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { currentValue, lastValuationDate } = this.positionForm.value;

    this.assetService
      .updatePosition(this.assetId, {
        currentValue: Number(currentValue),
        lastValuationDate,
      })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.asset.set(updated);
          this.isSaving.set(false);
          this.closeModal();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  onBuy(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.buyForm.markAllAsTouched();
    if (this.buyForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { amount, quantity, pocketId, transactionDate, categoryId, notes } =
      this.buyForm.getRawValue();

    this.submitInvestmentTransaction('Aporte', Number(pocketId), this.assetService
      .buy(this.assetId, {
        amount: Number(amount),
        quantity: Number(quantity),
        pocketId: Number(pocketId),
        transactionDate,
        categoryId: Number(categoryId),
        notes: notes?.trim() || undefined,
      }));
  }

  onYield(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.yieldForm.markAllAsTouched();
    if (this.yieldForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { amount, pocketId, transactionDate, categoryId, notes } =
      this.yieldForm.getRawValue();

    this.submitInvestmentTransaction('Rendimento', Number(pocketId), this.assetService
      .recordYield(this.assetId, {
        amount: Number(amount),
        pocketId: Number(pocketId),
        transactionDate,
        categoryId: Number(categoryId),
        notes: notes?.trim() || undefined,
      }));
  }

  private submitInvestmentTransaction(label: string, pocketId: number, request: Observable<InvestmentTransactionDto>): void {
    this.financialRecovery.trackWrite({
      label: `${label}: ${this.asset()?.name ?? 'Investimento'}`, pocketIds: [pocketId], assetId: this.assetId,
    }, request).pipe(finalize(() => this.isSaving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeModal();
        this.loadAll();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(financialWriteErrorMessage(err, 'Não foi possível registrar a movimentação do investimento.'));
        if (isUncertainFinancialWrite(err)) this.financialRecovery.check();
      },
    });
  }

  canSell(): boolean {
    const asset = this.asset();
    const available = investmentUnits(asset?.position.quantity);
    return !!asset && (asset.status === 'ACTIVE' || asset.status === 'MATURED') && available !== null && available > 0n;
  }

  sellRemainingQuantity(): string | null {
    const available = investmentUnits(this.asset()?.position.quantity);
    const quantity = investmentUnits(this.sellForm?.controls['quantity'].value);
    if (available === null || quantity === null || quantity <= 0n || quantity > available) return null;
    return investmentQuantityText(available - quantity);
  }

  sellAll(): void {
    this.sellForm.controls['quantity'].setValue(String(this.asset()!.position.quantity));
    this.sellForm.controls['quantity'].markAsTouched();
  }

  applySellSuggestion(): void {
    const available = investmentUnits(this.asset()?.position.quantity);
    const quantity = investmentUnits(this.sellForm.controls['quantity'].value);
    if (available === null || quantity === null) return;
    const suggestion = proportionalSaleValue(this.asset()!.position.currentValue, quantity, available);
    if (suggestion === null) return;
    this.sellForm.controls['grossAmount'].setValue(suggestion, { emitEvent: false });
    this.sellGrossEdited = false;
  }

  sellNetAmount(): number | null {
    const { grossAmount, taxAmount } = this.sellForm.value;
    if (this.sellForm.controls['grossAmount'].invalid || this.sellForm.controls['taxAmount'].invalid ||
        this.sellForm.hasError('taxExceedsGross')) return null;
    return redemptionNet(Number(grossAmount), Number(taxAmount));
  }

  onSell(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear' || this.sellRefreshing() || this.sellNeedsReview() || this.asset()?.status === 'REDEEMED') return;
    this.sellForm.markAllAsTouched();
    if (this.sellForm.invalid) return;
    this.sellForm.controls['quantity'].updateValueAndValidity();
    if (!this.canSell() || this.sellForm.invalid) return;
    const quantity = Number(investmentQuantityText(investmentUnits(this.sellForm.controls['quantity'].value)!));

    this.isSaving.set(true);
    this.errorMessage.set('');
    const { grossAmount, taxAmount, pocketId, transactionDate, categoryId, notes } = this.sellForm.getRawValue();
    this.sellPocketId.set(Number(pocketId));
    this.financialRecovery.sell(this.assetId, {
      quantity, operationId: crypto.randomUUID(),
      grossAmount: Number(grossAmount), taxAmount: Number(taxAmount),
      pocketId: Number(pocketId), transactionDate, categoryId: Number(categoryId),
      notes: notes?.trim() || undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving.set(false);
        // Keep writes blocked until the authoritative state has been read again.
        this.sellNeedsReview.set(true);
        this.refreshSellResult(true);
      },
      error: (err) => {
        this.isSaving.set(false);
        if (err?.status === 400 && Array.isArray(err.error?.errors)) {
          for (const fieldError of err.error.errors) {
            const control = this.sellForm.get(fieldError.field);
            if (control) {
              control.setErrors({ ...control.errors, server: fieldError.message });
              control.markAsTouched();
            }
          }
          this.errorMessage.set('Revise os campos indicados antes de enviar o resgate.');
        } else {
          this.errorMessage.set(translateApiError(err?.error?.message));
          if (err?.status === 400 && err.error?.message === 'taxAmount must not exceed grossAmount') {
            this.sellForm.setErrors({ taxExceedsGross: true });
          }
        }
        if (err?.status === 404) {
          this.refreshSellAvailability();
        } else if (err?.status === 409) {
          this.sellNeedsReview.set(true);
          this.errorMessage.set('A posição ou os dados da venda mudaram. Confira os saldos atualizados e revise a quantidade antes de enviar novamente.');
          this.refreshSellResult();
          this.categoryService.loadCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
        } else if (err?.status === 0 || err?.status >= 500 || err?.name === 'TimeoutError') {
          this.sellNeedsReview.set(true);
          this.errorMessage.set('Não foi possível confirmar o resgate. Confira o estado do ativo, o histórico e o extrato da conta antes de tentar novamente.');
          this.refreshSellResult();
        }
      },
    });
  }

  private refreshSellAvailability(): void {
    this.sellRefreshing.set(true);
    forkJoin({
      asset: this.assetService.getAsset(this.assetId),
      history: this.assetService.getTransactions(this.assetId),
      pockets: this.pocketService.loadPockets(),
      categories: this.categoryService.loadCategories(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ asset, history }) => {
        this.asset.set(asset);
        this.transactions.set([...history].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)));
        for (const control of Object.values(this.sellForm.controls)) control.updateValueAndValidity();
        this.sellRefreshing.set(false);
        if (asset.status === 'REDEEMED') this.closeModal();
      },
      error: () => {
        this.sellRefreshing.set(false);
        // Leave the unavailable investment screen; fresh selectors load on return.
        this.router.navigate(['/investments'], { queryParams: this.backQueryParams });
      },
    });
  }

  refreshSellResult(closeAfterSuccess = false): void {
    const pocketId = this.sellPocketId();
    if (!pocketId || this.sellRefreshing()) return;
    this.sellRefreshing.set(true);
    this.sellReviewLoaded.set(false);
    forkJoin({
      asset: this.assetService.getAsset(this.assetId),
      history: this.assetService.getTransactions(this.assetId),
      balance: this.pocketService.getBalance(pocketId),
      statement: this.transactionService.loadTransactions(pocketId),
      summaries: this.assetService.refreshAssets(),
      pockets: this.pocketService.loadPockets(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ asset, history, balance }) => {
        this.asset.set(asset);
        this.transactions.set([...history].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)));
        this.sellBalance.set(balance);
        this.financialRecovery.resolveSaleHistory(asset.id, history);
        this.financialRecovery.finishSaleRefresh(asset.id);
        this.sellForm.controls['quantity'].updateValueAndValidity();
        this.sellReviewLoaded.set(true);
        this.sellRefreshing.set(false);
        if (asset.status === 'REDEEMED' || closeAfterSuccess) {
          this.sellNeedsReview.set(false);
          this.closeModal();
        }
      },
      error: () => {
        this.sellRefreshing.set(false);
        this.errorMessage.set('Não foi possível atualizar todos os dados. Consulte o resultado novamente antes de reenviar.');
      },
    });
  }

  allowSellRetry(): void {
    if (this.financialRecovery.operation()?.sale) {
      this.financialRecovery.retrySale();
      return;
    }
    if (!this.sellReviewLoaded() || this.sellRefreshing() || this.asset()?.status === 'REDEEMED') return;
    this.sellNeedsReview.set(false);
    this.errorMessage.set('');
  }

  onDelete(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.isSaving.set(true);
    this.errorMessage.set('');

    this.assetService.deleteAsset(this.assetId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving.set(false);
        // Retorna para a listagem preservando o filtro
        this.router.navigate(['/investments'], { queryParams: this.backQueryParams });
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message));
      },
    });
  }

  // ── Form builders ─────────────────────────────────────────────────────────
  private buildEditForm(): void {
    const a = this.asset();
    this.editForm = this.fb.group({
      name:                   [a?.name ?? '', [Validators.required, Validators.maxLength(255)]],
      legalEntityId:          [a?.legalEntity.id ?? '', Validators.required],
      custodianLegalEntityId: [a?.custodianLegalEntity?.id ?? null],
      liquidityType:          [a?.liquidityType ?? null],
    });
  }

  private buildPositionForm(): void {
    const pos = this.asset()?.position;
    this.positionForm = this.fb.group({
      currentValue: [pos?.currentValue ?? '', [Validators.required, Validators.min(0)]],
      lastValuationDate: [
        pos?.lastValuationDate ?? this.toLocalDateString(new Date()),
        Validators.required,
      ],
    });
  }

  private buildBuyForm(): void {
    const cat = this.categoryBuy();
    this.buyForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      quantity: ['', [Validators.required, (control: AbstractControl) => {
        if (control.value == null || control.value === '') return null;
        const quantity = Number(control.value);
        return Number.isFinite(quantity) && quantity > 0 ? null : { positiveQuantity: true };
      }]],
      pocketId: ['', Validators.required],
      transactionDate: [this.toLocalDateString(new Date()), Validators.required],
      categoryId: [{ value: cat?.id ?? '', disabled: true }, Validators.required],
      notes: [''],
    });
  }

  private buildYieldForm(): void {
    const cat = this.categoryYield();
    this.yieldForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      pocketId: ['', Validators.required],
      transactionDate: [this.toLocalDateString(new Date()), Validators.required],
      categoryId: [{ value: cat?.id ?? '', disabled: true }, Validators.required],
      notes: [''],
    });
  }

  private buildSellForm(): void {
    this.sellFormChanges.unsubscribe();
    this.sellFormChanges = new Subscription();
    this.sellGrossEdited = false;
    const cat = this.categorySell();
    const currentValue = this.asset()?.position.currentValue ?? '';
    const finiteAmount = (positive: boolean) => (control: AbstractControl) => {
      const value = control.value;
      if (value == null || value === '') return null; // required handles absence
      const amount = Number(value);
      return Number.isFinite(amount) && (positive ? amount > 0 : amount >= 0) ? null : { amount: true };
    };
    this.sellForm = this.fb.group({
      quantity: [String(this.asset()?.position.quantity ?? ''), [Validators.required, (control: AbstractControl) => {
        const quantity = investmentUnits(control.value);
        const available = investmentUnits(this.asset()?.position.quantity);
        if (quantity === null || quantity <= 0n) return { quantity: true };
        // Reject decimal text that the numeric HTTP contract cannot represent faithfully.
        if (investmentUnits(Number(investmentQuantityText(quantity))) !== quantity) return { quantity: true };
        return available !== null && quantity <= available ? null : { available: true };
      }]],
      grossAmount: [currentValue, [Validators.required, finiteAmount(true)]],
      taxAmount: ['', [Validators.required, finiteAmount(false)]],
      pocketId: ['', [Validators.required, (control: AbstractControl) =>
        this.eligiblePockets().some(p => p.active && p.id === Number(control.value)) ? null : { pocket: true }]],
      transactionDate: [this.toLocalDateString(new Date()), Validators.required],
      categoryId: [cat?.id ?? '', [Validators.required, (control: AbstractControl) =>
        this.sellCategories().some(c => c.id === Number(control.value)) ? null : { category: true }]],
      notes: [''],
    }, { validators: form => {
      const gross = form.get('grossAmount');
      const tax = form.get('taxAmount');
      return gross?.valid && tax?.valid && Number(tax.value) > Number(gross.value) ? { taxExceedsGross: true } : null;
    } });
    this.sellFormChanges.add(this.sellForm.controls['grossAmount'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.sellGrossEdited = true));
    this.sellFormChanges.add(this.sellForm.controls['quantity'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (!this.sellGrossEdited) this.applySellSuggestion();
      }));
  }

  private toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── Getters de controle ───────────────────────────────────────────────────
  ctrl(form: FormGroup, name: string): AbstractControl {
    return form.controls[name];
  }

  categoryNameFor(type: 'buy' | 'yield' | 'sell'): string {
    if (type === 'buy') return this.categoryBuy()?.name ?? CATEGORY_BUY;
    if (type === 'yield') return this.categoryYield()?.name ?? CATEGORY_YIELD;
    return this.categorySell()?.name ?? CATEGORY_SELL;
  }
}
