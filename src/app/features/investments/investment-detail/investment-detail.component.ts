import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';

import { AssetService } from '../../../core/services/asset.service';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { CategoryService } from '../../../core/services/category.service';
import { PocketService } from '../../../core/services/pocket.service';
import {
  AssetDetailDto,
  InvestmentTransactionDto,
  InvestmentTransactionType,
} from '../../../core/models/asset.model';
import { translateApiError } from '../../../core/utils/api-error.util';

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
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './investment-detail.component.html',
  styleUrl: './investment-detail.component.css',
})
export class InvestmentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly assetService = inject(AssetService);
  readonly legalEntityService = inject(LegalEntityService);
  readonly categoryService = inject(CategoryService);
  readonly pocketService = inject(PocketService);

  // ── State ─────────────────────────────────────────────────────────────────
  readonly asset = signal<AssetDetailDto | null>(null);
  readonly transactions = signal<InvestmentTransactionDto[]>([]);
  readonly isLoading = signal(true);
  readonly isLoadingTransactions = signal(false);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');

  private assetId!: number;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly variation = computed(() => {
    const a = this.asset();
    if (!a || !a.position.totalInvested) return 0;
    const reference =
      a.status === 'REDEEMED' ? a.position.redeemedValue : a.position.currentValue;
    return ((reference - a.position.totalInvested) / a.position.totalInvested) * 100;
  });

  // FIX 2: valor de referência correto para o card de posição
  readonly displayCurrentValue = computed(() => {
    const a = this.asset();
    if (!a) return 0;
    return a.status === 'REDEEMED' ? a.position.redeemedValue : a.position.currentValue;
  });

  // FIX 3: pockets elegíveis
  readonly eligiblePockets = computed(() =>
    this.pocketService
      .pockets()
      .filter((p) => p.type === 'BANK_ACCOUNT' || p.type === 'CASH'),
  );

  // FIX 4: categorias de sistema pré-definidas por tipo de transação
  private readonly categoryBuy = computed(() =>
    this.categoryService.categories().find((c) => c.name === CATEGORY_BUY),
  );
  private readonly categoryYield = computed(() =>
    this.categoryService.categories().find((c) => c.name === CATEGORY_YIELD),
  );
  private readonly categorySell = computed(() =>
    this.categoryService.categories().find((c) => c.name === CATEGORY_SELL),
  );

  // ── Forms ─────────────────────────────────────────────────────────────────
  editForm!: FormGroup;
  positionForm!: FormGroup;
  buyForm!: FormGroup;
  yieldForm!: FormGroup;
  sellForm!: FormGroup;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.assetId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadAll();

    // FIX 1 & 3: sempre recarrega para garantir disponibilidade nos modais
    this.legalEntityService.loadLegalEntities().subscribe();
    this.categoryService.loadCategories().subscribe();
    this.pocketService.loadPockets().subscribe();
  }

  private loadAll(): void {
    this.isLoading.set(true);
    this.assetService.getAsset(this.assetId).subscribe({
      next: (data) => {
        this.asset.set(data);
        this.isLoading.set(false);
        this.loadTransactions();
      },
      error: () => {
        this.isLoading.set(false);
        this.router.navigate(['/investments']);
      },
    });
  }

  private loadTransactions(): void {
    this.isLoadingTransactions.set(true);
    this.assetService.getTransactions(this.assetId).subscribe({
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
    return category === 'RENDA_FIXA' ? 'Renda Fixa' : 'Previdência';
  }

  transactionLabel(type: InvestmentTransactionType): string {
    const map: Record<InvestmentTransactionType, string> = {
      BUY: 'Aporte',
      SELL: 'Resgate',
      YIELD: 'Rendimento',
      TAX: 'Imposto',
    };
    return map[type];
  }

  isCredit(type: InvestmentTransactionType): boolean {
    return type === 'YIELD';
  }

  isDebit(type: InvestmentTransactionType): boolean {
    return type === 'SELL' || type === 'TAX';
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

  // ── Modal ─────────────────────────────────────────────────────────────────
  openModal(type: ModalType): void {
    this.errorMessage.set('');
    this.activeModal.set(type);

    if (type === 'edit') this.buildEditForm();
    if (type === 'update-position') this.buildPositionForm();
    if (type === 'buy') this.buildBuyForm();
    if (type === 'yield') this.buildYieldForm();
    if (type === 'sell') this.buildSellForm();
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set('');
  }

  // ── Submits ───────────────────────────────────────────────────────────────
  onEdit(): void {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { name, legalEntityId } = this.editForm.value;

    this.assetService
      .updateAsset(this.assetId, {
        name: name.trim(),
        legalEntityId: Number(legalEntityId),
      })
      .subscribe({
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
      .subscribe({
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
    this.buyForm.markAllAsTouched();
    if (this.buyForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { amount, quantity, pocketId, transactionDate, categoryId, notes } =
      this.buyForm.getRawValue();

    this.assetService
      .buy(this.assetId, {
        amount: Number(amount),
        quantity: Number(quantity),
        pocketId: Number(pocketId),
        transactionDate,
        categoryId: Number(categoryId),
        notes: notes?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeModal();
          this.loadAll();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  onYield(): void {
    this.yieldForm.markAllAsTouched();
    if (this.yieldForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { amount, pocketId, transactionDate, categoryId, notes } =
      this.yieldForm.getRawValue();

    this.assetService
      .recordYield(this.assetId, {
        amount: Number(amount),
        pocketId: Number(pocketId),
        transactionDate,
        categoryId: Number(categoryId),
        notes: notes?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeModal();
          this.loadAll();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  onSell(): void {
    this.sellForm.markAllAsTouched();
    if (this.sellForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { grossAmount, taxAmount, quantity, pocketId, transactionDate, categoryId, notes } =
      this.sellForm.getRawValue();

    this.assetService
      .sell(this.assetId, {
        grossAmount: Number(grossAmount),
        taxAmount: Number(taxAmount),
        quantity: Number(quantity),
        pocketId: Number(pocketId),
        transactionDate,
        categoryId: Number(categoryId),
        notes: notes?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeModal();
          this.loadAll();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  onDelete(): void {
    this.isSaving.set(true);
    this.errorMessage.set('');

    this.assetService.deleteAsset(this.assetId).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.router.navigate(['/investments']);
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
      name: [a?.name ?? '', [Validators.required, Validators.maxLength(255)]],
      legalEntityId: [a?.legalEntity.id ?? '', Validators.required],
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

  // FIX 4: categoria pré-definida e desabilitada
  private buildBuyForm(): void {
    const cat = this.categoryBuy();
    this.buyForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      quantity: ['', [Validators.required, Validators.min(0)]],
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
    const cat = this.categorySell();
    const currentValue = this.asset()?.position.currentValue ?? '';
    this.sellForm = this.fb.group({
      grossAmount: [{ value: currentValue, disabled: true }, [Validators.required, Validators.min(0.01)]],
      taxAmount: ['', [Validators.required, Validators.min(0)]],
      quantity: [{ value: 1, disabled: true }],
      pocketId: ['', Validators.required],
      transactionDate: [this.toLocalDateString(new Date()), Validators.required],
      categoryId: [{ value: cat?.id ?? '', disabled: true }, Validators.required],
      notes: [''],
    });
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

  // FIX 4: label da categoria pré-definida para exibição no campo desabilitado
  categoryNameFor(type: 'buy' | 'yield' | 'sell'): string {
    if (type === 'buy') return this.categoryBuy()?.name ?? CATEGORY_BUY;
    if (type === 'yield') return this.categoryYield()?.name ?? CATEGORY_YIELD;
    return this.categorySell()?.name ?? CATEGORY_SELL;
  }
}