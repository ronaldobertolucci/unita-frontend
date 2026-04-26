import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PocketService, BANK_ACCOUNT_TYPES, BENEFIT_TYPES } from '../../core/services/pocket.service';
import { translateApiError } from '../../core/utils/api-error.util';
import {
  PocketSummaryDto,
  PocketType,
  BankAccountDto,
  BenefitAccountDto,
  FgtsEmployerAccountDto,
  LegalEntityDto,
  IndividualEmployerDto,
  LegalEntityEmployerDto,
} from '../../core/models/pocket.model';
import { RouterLink } from '@angular/router';

type ModalType =
  | 'create-type-select'
  | 'create-bank-account'
  | 'create-benefit-account'
  | 'create-fgts'
  | 'create-cash-confirm'
  | 'detail-bank-account'
  | 'detail-benefit-account'
  | 'detail-fgts'
  | 'detail-cash'
  | 'confirm-delete'
  | null;

@Component({
  selector: 'app-pockets',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './pockets.component.html',
  styleUrl: './pockets.component.css',
})
export class PocketsComponent implements OnInit {
  private readonly pocketService = inject(PocketService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado da página ────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly isLoadingDetail = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // ─── Dados de referência ─────────────────────────────────────────────────

  readonly bankAccountTypes = BANK_ACCOUNT_TYPES;
  readonly benefitTypes = BENEFIT_TYPES;
  readonly legalEntities = signal<LegalEntityDto[]>([]);
  readonly individualEmployers = signal<IndividualEmployerDto[]>([]);
  readonly legalEntityEmployers = signal<LegalEntityEmployerDto[]>([]);
  readonly isLoadingRef = signal(false);

  // ─── Pockets ──────────────────────────────────────────────────────────────

  readonly pockets = this.pocketService.pockets;
  readonly activePockets = computed(() =>
    this.pockets().filter(p => p.active)
  );

  readonly inactivePockets = computed(() =>
    this.pockets().filter(p => !p.active)
  );

  readonly inactivePocketsVisible = signal(false);

  readonly totalBalance = computed(() =>
    this.activePockets().reduce((sum, p) => sum + p.balance, 0)
  );

  readonly hasCash = computed(() =>
    this.pockets().some(p => p.type === 'CASH')
  );

  // ─── Detalhes do pocket selecionado ──────────────────────────────────────

  readonly selectedPocket = signal<PocketSummaryDto | null>(null);
  readonly bankAccountDetail = signal<BankAccountDto | null>(null);
  readonly benefitAccountDetail = signal<BenefitAccountDto | null>(null);
  readonly fgtsDetail = signal<FgtsEmployerAccountDto | null>(null);

  // ─── Formulários ─────────────────────────────────────────────────────────

  readonly bankAccountForm = this.fb.group({
    legalEntityId: [null as number | null, Validators.required],
    number: ['', [Validators.required, Validators.maxLength(20)]],
    agency: ['', [Validators.required, Validators.maxLength(10)]],
    bankAccountTypeId: [null as number | null, Validators.required],
    status: ['ACTIVE'],
  });

  readonly benefitAccountForm = this.fb.group({
    legalEntityId: [null as number | null, Validators.required],
    benefitTypeId: [null as number | null, Validators.required],
    status: ['ACTIVE'],
  });

  readonly fgtsForm = this.fb.group({
    employerType: ['individual' as 'individual' | 'legal-entity'],
    employerId: [null as number | null, Validators.required],
    admissionDate: ['', Validators.required],
    dismissalDate: [''],
    status: ['ACTIVE'],
  });

  readonly editBankAccountForm = this.fb.group({
    status: ['ACTIVE' as string, Validators.required],
  });

  readonly editBenefitAccountForm = this.fb.group({
    status: ['ACTIVE' as string, Validators.required],
  });

  readonly editFgtsForm = this.fb.group({
    dismissalDate: [''],
    status: ['ACTIVE' as string, Validators.required],
  });

  // ─── Getters de controles ─────────────────────────────────────────────────

  get baLegalEntityId() { return this.bankAccountForm.get('legalEntityId')!; }
  get baNumber() { return this.bankAccountForm.get('number')!; }
  get baAgency() { return this.bankAccountForm.get('agency')!; }
  get baBankAccountTypeId() { return this.bankAccountForm.get('bankAccountTypeId')!; }

  get bfLegalEntityId() { return this.benefitAccountForm.get('legalEntityId')!; }
  get bfBenefitTypeId() { return this.benefitAccountForm.get('benefitTypeId')!; }

  get fgtsEmployerType() { return this.fgtsForm.get('employerType')!; }
  get fgtsEmployerId() { return this.fgtsForm.get('employerId')!; }
  get fgtsAdmissionDate() { return this.fgtsForm.get('admissionDate')!; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.pocketService.loadPockets().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  formatCurrency(value: number): string {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  getPocketTypeLabel(type: PocketType): string {
    const labels: Record<PocketType, string> = {
      BANK_ACCOUNT: 'Conta Bancária',
      BENEFIT_ACCOUNT: 'Conta de Benefício',
      FGTS_EMPLOYER_ACCOUNT: 'FGTS',
      CASH: 'Carteira',
    };
    return labels[type];
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      ACTIVE: 'Ativa',
      INACTIVE: 'Inativa',
      BLOCKED: 'Bloqueada',
    };
    return labels[status] ?? status;
  }

  getEmployerLabel(id: number): string {
    const individual = this.individualEmployers().find(e => e.id === id);
    if (individual) return individual.name;
    const legal = this.legalEntityEmployers().find(e => e.id === id);
    if (legal) return legal.legalEntity.corporateName;
    return '—';
  }

  // ─── Abertura de modais ───────────────────────────────────────────────────

  openCreateModal(): void {
    this.errorMessage.set(null);
    this.activeModal.set('create-type-select');
  }

  selectPocketType(type: PocketType): void {
    this.errorMessage.set(null);
    this.bankAccountForm.reset({ status: 'ACTIVE' });
    this.benefitAccountForm.reset({ status: 'ACTIVE' });
    this.fgtsForm.reset({ employerType: 'individual', status: 'ACTIVE' });

    if (type === 'BANK_ACCOUNT') {
      this.activeModal.set('create-bank-account');
      this.loadLegalEntities();
    } else if (type === 'BENEFIT_ACCOUNT') {
      this.activeModal.set('create-benefit-account');
      this.loadLegalEntities();
    } else if (type === 'FGTS_EMPLOYER_ACCOUNT') {
      this.activeModal.set('create-fgts');
      this.loadEmployers();
    } else if (type === 'CASH') {
      this.activeModal.set('create-cash-confirm');
    }
  }

  openDetailModal(pocket: PocketSummaryDto): void {
    this.selectedPocket.set(pocket);
    this.errorMessage.set(null);
    this.isLoadingDetail.set(true);

    if (pocket.type === 'BANK_ACCOUNT') {
      this.activeModal.set('detail-bank-account');
      this.pocketService.getBankAccount(pocket.id).subscribe({
        next: detail => {
          this.bankAccountDetail.set(detail);
          this.editBankAccountForm.patchValue({ status: detail.status });
          this.isLoadingDetail.set(false);
        },
        error: () => this.isLoadingDetail.set(false),
      });
    } else if (pocket.type === 'BENEFIT_ACCOUNT') {
      this.activeModal.set('detail-benefit-account');
      this.pocketService.getBenefitAccount(pocket.id).subscribe({
        next: detail => {
          this.benefitAccountDetail.set(detail);
          this.editBenefitAccountForm.patchValue({ status: detail.status });
          this.isLoadingDetail.set(false);
        },
        error: () => this.isLoadingDetail.set(false),
      });
    } else if (pocket.type === 'FGTS_EMPLOYER_ACCOUNT') {
      this.activeModal.set('detail-fgts');
      this.pocketService.getFgts(pocket.id).subscribe({
        next: detail => {
          this.fgtsDetail.set(detail);
          this.editFgtsForm.patchValue({
            status: detail.status,
            dismissalDate: detail.dismissalDate ?? '',
          });
          this.isLoadingDetail.set(false);
        },
        error: () => this.isLoadingDetail.set(false),
      });
    } else if (pocket.type === 'CASH') {
      this.activeModal.set('detail-cash');
      this.isLoadingDetail.set(false);
    }
  }

  openDeleteConfirm(): void {
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedPocket.set(null);
    this.bankAccountDetail.set(null);
    this.benefitAccountDetail.set(null);
    this.fgtsDetail.set(null);
  }

  // ─── Carregamento de referências ──────────────────────────────────────────

  private loadLegalEntities(): void {
    if (this.legalEntities().length > 0) return;
    this.isLoadingRef.set(true);
    this.pocketService.getLegalEntities().subscribe({
      next: list => { this.legalEntities.set(list); this.isLoadingRef.set(false); },
      error: () => this.isLoadingRef.set(false),
    });
  }

  private loadEmployers(): void {
    this.isLoadingRef.set(true);
    let pending = 2;
    const done = () => { if (--pending === 0) this.isLoadingRef.set(false); };

    this.pocketService.getIndividualEmployers().subscribe({
      next: list => { this.individualEmployers.set(list); done(); },
      error: () => done(),
    });
    this.pocketService.getLegalEntityEmployers().subscribe({
      next: list => {
        this.legalEntityEmployers.set(list); done();
      },
      error: () => done(),
    });
  }

  // ─── Computed para empregadores filtrados por tipo ────────────────────────

  get currentEmployerList(): { id: number; label: string }[] {
    if (this.fgtsEmployerType.value === 'individual') {
      return this.individualEmployers().map(e => ({ id: e.id, label: `${e.name} (CPF: ${e.cpf})` }));
    }
    return this.legalEntityEmployers().map(e => ({ id: e.id, label: e.legalEntity.corporateName }));
  }

  onEmployerTypeChange(): void {
    this.fgtsForm.patchValue({ employerId: null });
  }

  // ─── Criação ─────────────────────────────────────────────────────────────

  createBankAccount(): void {
    if (this.bankAccountForm.invalid) {
      this.bankAccountForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.bankAccountForm.value;
    this.pocketService.createBankAccount({
      legalEntityId: v.legalEntityId!,
      number: v.number!,
      agency: v.agency!,
      bankAccountTypeId: v.bankAccountTypeId!,
      status: (v.status as any) ?? 'ACTIVE',
    }).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar conta bancária.'));
      },
    });
  }

  createBenefitAccount(): void {
    if (this.benefitAccountForm.invalid) {
      this.benefitAccountForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.benefitAccountForm.value;
    this.pocketService.createBenefitAccount({
      legalEntityId: v.legalEntityId!,
      benefitTypeId: v.benefitTypeId!,
      status: (v.status as any) ?? 'ACTIVE',
    }).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar conta de benefício.'));
      },
    });
  }

  createFgts(): void {
    if (this.fgtsForm.invalid) {
      this.fgtsForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.fgtsForm.value;
    const payload: any = {
      employerId: v.employerId!,
      admissionDate: v.admissionDate!,
      status: v.status ?? 'ACTIVE',
    };
    if (v.dismissalDate) payload.dismissalDate = v.dismissalDate;
    this.pocketService.createFgts(payload).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar vínculo FGTS.'));
      },
    });
  }

  createCash(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.pocketService.createCash().subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar carteira.'));
      },
    });
  }

  // ─── Edição ───────────────────────────────────────────────────────────────

  saveBankAccount(): void {
    if (this.editBankAccountForm.invalid) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const id = this.selectedPocket()!.id;
    this.pocketService.updateBankAccount(id, {
      status: this.editBankAccountForm.value.status as any,
    }).subscribe({
      next: detail => {
        this.bankAccountDetail.set(detail);
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao atualizar conta.'));
      },
    });
  }

  saveBenefitAccount(): void {
    if (this.editBenefitAccountForm.invalid) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const id = this.selectedPocket()!.id;
    this.pocketService.updateBenefitAccount(id, {
      status: this.editBenefitAccountForm.value.status as any,
    }).subscribe({
      next: detail => {
        this.benefitAccountDetail.set(detail);
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao atualizar conta.'));
      },
    });
  }

  saveFgts(): void {
    if (this.editFgtsForm.invalid) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const id = this.selectedPocket()!.id;
    const v = this.editFgtsForm.value;
    this.pocketService.updateFgts(id, {
      status: v.status as any,
      dismissalDate: v.dismissalDate || null,
    }).subscribe({
      next: detail => {
        this.fgtsDetail.set(detail);
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao atualizar FGTS.'));
      },
    });
  }

  // ─── Exclusão ─────────────────────────────────────────────────────────────

  deletePocket(): void {
    const pocket = this.selectedPocket();
    if (!pocket) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    let delete$;
    if (pocket.type === 'BANK_ACCOUNT') delete$ = this.pocketService.deleteBankAccount(pocket.id);
    else if (pocket.type === 'BENEFIT_ACCOUNT') delete$ = this.pocketService.deleteBenefitAccount(pocket.id);
    else delete$ = this.pocketService.deleteFgts(pocket.id);
    // cash não pode ser deletado

    delete$.subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir. Verifique se não há transações vinculadas.'));
      },
    });
  }
}