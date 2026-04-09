import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
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
import { AssetSummaryDto, AssetCategory } from '../../core/models/asset.model';
import { translateApiError } from '../../core/utils/api-error.util';

type AssetTab = 'fixed-income' | 'pension';

@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './investments.component.html',
  styleUrl: './investments.component.css',
})
export class InvestmentsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);

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
  readonly indexers = ['CDI', 'IPCA', 'SELIC', 'PREFIXADO'] as const;
  readonly pensionTypes = ['PGBL', 'VGBL', 'ENTIDADE_FECHADA'] as const;
  readonly taxRegimes = ['PROGRESSIVO', 'REGRESSIVO'] as const;

  readonly pensionTypeLabels: Record<string, string> = {
    PGBL: 'PGBL',
    VGBL: 'VGBL',
    ENTIDADE_FECHADA: 'Entidade Fechada',
  };

  readonly taxRegimeLabels: Record<string, string> = {
    PROGRESSIVO: 'Progressivo',
    REGRESSIVO: 'Regressivo',
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.assetService.loadAssets();
    // FIX 1: sempre recarrega para garantir disponibilidade no modal
    this.legalEntityService.loadLegalEntities().subscribe();
    this.buildForms();
  }

  // ── Helpers de exibição ───────────────────────────────────────────────────
  categoryLabel(category: AssetCategory): string {
    return category === 'RENDA_FIXA' ? 'Renda Fixa' : 'Previdência';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      ACTIVE: 'Ativo',
      MATURED: 'Vencido',
      REDEEMED: 'Resgatado',
    };
    return map[status] ?? status;
  }

  // FIX 2: exibe redeemedValue quando resgatado; currentValue caso contrário
  displayValue(asset: AssetSummaryDto): number {
    return asset.status === 'REDEEMED' ? asset.redeemedValue : asset.currentValue;
  }

  // FIX 2: calcula variação sobre o valor de referência correto
  variation(asset: AssetSummaryDto): number {
    if (!asset.totalInvested) return 0;
    const reference = asset.status === 'REDEEMED' ? asset.redeemedValue : asset.currentValue;
    return ((reference - asset.totalInvested) / asset.totalInvested) * 100;
  }

  // ── Navegação ─────────────────────────────────────────────────────────────
  openDetail(id: number): void {
    this.router.navigate(['/investments', id]);
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

    const { name, legalEntityId, indexer, annualRate, maturityDate, taxFree } =
      this.fixedIncomeForm.value;

    this.assetService
      .createFixedIncome({
        name: name.trim(),
        legalEntityId: Number(legalEntityId),
        indexer,
        annualRate: Number(annualRate),
        maturityDate,
        taxFree: !!taxFree,
      })
      .subscribe({
        next: () => {
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

    const { name, legalEntityId, pensionType, taxRegime } = this.pensionForm.value;

    this.assetService
      .createPension({
        name: name.trim(),
        legalEntityId: Number(legalEntityId),
        pensionType,
        taxRegime,
      })
      .subscribe({
        next: () => {
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
      name: ['', [Validators.required, Validators.maxLength(255)]],
      legalEntityId: ['', Validators.required],
      indexer: ['', Validators.required],
      annualRate: ['', [Validators.required, Validators.min(0)]],
      maturityDate: ['', Validators.required],
      taxFree: [false],
    });

    this.pensionForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      legalEntityId: ['', Validators.required],
      pensionType: ['', Validators.required],
      taxRegime: ['', Validators.required],
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