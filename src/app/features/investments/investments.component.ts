import { Component, OnInit, OnDestroy, signal, inject, computed, effect } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';

import { AssetService } from '../../core/services/asset.service';
import { LegalEntityService } from '../../core/services/legal-entity.service';
import { PageContextService } from '../../core/services/page-context.service';
import { AssetSummaryDto, AssetCategory } from '../../core/models/asset.model';
import { translateApiError } from '../../core/utils/api-error.util';

type AssetTab = 'fixed-income' | 'pension';

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './investments.component.html',
  styleUrl: './investments.component.css',
})
export class InvestmentsComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private pageContextService = inject(PageContextService);

  readonly assetService = inject(AssetService);
  readonly legalEntityService = inject(LegalEntityService);

  // ── UI state ──────────────────────────────────────────────────────────────
  readonly modalOpen = signal(false);
  readonly activeTab = signal<AssetTab>('fixed-income');
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');

  // ── Forms ─────────────────────────────────────────────────────────────────
  fixedIncomeForm!: FormGroup;
  pensionForm!: FormGroup;

  // ── Opções ────────────────────────────────────────────────────────────────
  readonly indexers = ['CDI', 'IPCA', 'PREFIXADO', 'SELIC'] as const;
  readonly pensionTypes = ['ENTIDADE_FECHADA', 'PGBL', 'VGBL'] as const;
  readonly taxRegimes = ['PROGRESSIVO', 'REGRESSIVO'] as const;
  readonly liquidityTypes = ['DIARIA', 'MERCADO', 'NO_VENCIMENTO', 'PRAZO_FIXO', 'PREVIDENCIARIA'] as const;

  readonly liquidityTypeLabels: Record<string, string> = {
    DIARIA:         'Diária',
    MERCADO:        'Mercado secundário',
    NO_VENCIMENTO:  'No vencimento',
    PRAZO_FIXO:     'Prazo fixo',
    PREVIDENCIARIA: 'Previdenciária',
  };

  readonly pensionTypeLabels: Record<string, string> = {
    PGBL: 'PGBL',
    VGBL: 'VGBL',
    ENTIDADE_FECHADA: 'Entidade Fechada',
  };

  readonly taxRegimeLabels: Record<string, string> = {
    PROGRESSIVO: 'Progressivo',
    REGRESSIVO: 'Regressivo',
  };

  // ── Filtro de custodiante ─────────────────────────────────────────────────
  readonly selectedCustodianName = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('custodian'))),
    { initialValue: null }
  );

  readonly availableCustodians = computed(() => {
    const names = new Set<string>();
    for (const asset of this.assetService.assets()) {
      if (asset.custodianLegalEntityName) {
        names.add(asset.custodianLegalEntityName);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  // ── Listas filtradas ──────────────────────────────────────────────────────
  readonly activeAssets = computed(() => {
    const custodian = this.selectedCustodianName();
    return this.assetService.assets()
      .filter(a => a.status !== 'REDEEMED')
      .filter(a => !custodian || a.custodianLegalEntityName === custodian);
  });

  readonly redeemedAssets = computed(() => {
    const custodian = this.selectedCustodianName();
    return this.assetService.assets()
      .filter(a => a.status === 'REDEEMED')
      .filter(a => !custodian || a.custodianLegalEntityName === custodian);
  });

  readonly redeemedVisible = signal(false);

  // ── Total consolidado ─────────────────────────────────────────────────────
  readonly totalConsolidated = computed(() =>
    this.activeAssets().reduce((sum, a) => sum + a.currentValue, 0)
  );

  // ── Construtor: sincroniza total com o contexto de página ─────────────────
  constructor() {
    effect(() => {
      const loading  = this.assetService.isLoading();
      const hasAssets = this.assetService.assets().length > 0;
      const total    = this.totalConsolidated();

      this.pageContextService.summaryDisplay.set(
        !loading && hasAssets ? CURRENCY_FORMATTER.format(total) : null
      );
    }, { allowSignalWrites: true });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.assetService.loadAssets();
    this.legalEntityService.loadLegalEntities().subscribe();
    this.buildForms();

    this.pageContextService.pageSubtitle.set('Acompanhe seus ativos de renda fixa e previdência');
    this.pageContextService.ctaLabel.set('Novo ativo');
    this.pageContextService.ctaCallback.set(() => this.openModal());
  }

  ngOnDestroy(): void {
    this.pageContextService.clear();
  }

  // ── Helpers de exibição ───────────────────────────────────────────────────
  categoryLabel(category: AssetCategory): string {
    return category === 'RENDA_FIXA' ? 'Renda Fixa' : 'Previdência';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      ACTIVE:   'Ativo',
      MATURED:  'Vencido',
      REDEEMED: 'Resgatado',
    };
    return map[status] ?? status;
  }

  displayValue(asset: AssetSummaryDto): number {
    return asset.status === 'REDEEMED' ? asset.redeemedValue : asset.currentValue;
  }

  variation(asset: AssetSummaryDto): number {
    if (!asset.totalInvested) return 0;
    const reference = asset.status === 'REDEEMED' ? asset.redeemedValue : asset.currentValue;
    return ((reference - asset.totalInvested) / asset.totalInvested) * 100;
  }

  // ── Navegação ─────────────────────────────────────────────────────────────
  openDetail(id: number): void {
    this.router.navigate(['/investments', id], {
      queryParams: { custodian: this.selectedCustodianName() || null },
    });
  }

  setCustodian(name: string | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { custodian: name || null },
      queryParamsHandling: 'merge',
    });
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openModal(): void {
    this.buildForms();
    this.errorMessage.set('');
    this.activeTab.set('fixed-income');
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  setTab(tab: AssetTab): void {
    this.activeTab.set(tab);
    this.errorMessage.set('');
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  onSubmit(): void {
    if (this.activeTab() === 'fixed-income') {
      this.submitFixedIncome();
    } else {
      this.submitPension();
    }
  }

  private submitFixedIncome(): void {
    this.fixedIncomeForm.markAllAsTouched();
    if (this.fixedIncomeForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { name, legalEntityId, indexer, annualRate, maturityDate, liquidityType, taxFree, custodianLegalEntityId } =
      this.fixedIncomeForm.value;

    this.assetService
      .createFixedIncome({
        name: name.trim(),
        legalEntityId: Number(legalEntityId),
        indexer,
        annualRate: Number(annualRate),
        maturityDate,
        liquidityType,
        taxFree: !!taxFree,
        custodianLegalEntityId: custodianLegalEntityId ? Number(custodianLegalEntityId) : null,
      })
      .subscribe({
        next: () => {
          this.assetService.loadAssets();
          this.isSaving.set(false);
          this.closeModal();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  private submitPension(): void {
    this.pensionForm.markAllAsTouched();
    if (this.pensionForm.invalid) return;

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { name, legalEntityId, pensionType, taxRegime, custodianLegalEntityId } =
      this.pensionForm.value;

    this.assetService
      .createPension({
        name: name.trim(),
        legalEntityId: Number(legalEntityId),
        pensionType,
        taxRegime,
        custodianLegalEntityId: custodianLegalEntityId ? Number(custodianLegalEntityId) : null,
      })
      .subscribe({
        next: () => {
          this.assetService.loadAssets();
          this.isSaving.set(false);
          this.closeModal();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err?.error?.message));
        },
      });
  }

  // ── Form builders ─────────────────────────────────────────────────────────
  private buildForms(): void {
    this.fixedIncomeForm = this.fb.group({
      name:                   ['', [Validators.required, Validators.maxLength(255)]],
      legalEntityId:          ['', Validators.required],
      indexer:                ['', Validators.required],
      annualRate:             ['', [Validators.required, Validators.min(0)]],
      maturityDate:           ['', Validators.required],
      liquidityType:          ['', Validators.required],
      taxFree:                [false],
      custodianLegalEntityId: [null],
    });

    this.pensionForm = this.fb.group({
      name:                   ['', [Validators.required, Validators.maxLength(255)]],
      legalEntityId:          ['', Validators.required],
      pensionType:            ['', Validators.required],
      taxRegime:              ['', Validators.required],
      custodianLegalEntityId: [null],
    });
  }

  // ── Getters de controle ───────────────────────────────────────────────────
  get fi(): Record<string, AbstractControl> {
    return this.fixedIncomeForm.controls;
  }

  get pe(): Record<string, AbstractControl> {
    return this.pensionForm.controls;
  }
}