import { Component, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { LegalEntityDto } from '../../../core/models/legal-entity.model';
import { translateApiError } from '../../../core/utils/api-error.util';
import { CNPJ_INPUT_PATTERN, formatCnpj, normalizeCnpj } from '../../../core/utils/cnpj.util';
import { SessionService } from '../../../core/services/session.service';
import { HttpErrorResponse } from '@angular/common/http';
import { isUncertainCreation } from '../../../core/utils/registration-error.util';

type ModalType = 'create' | 'edit' | 'confirm-delete' | null;

@Component({
  selector: 'app-legal-entities',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './legal-entities.component.html',
  styleUrl: './legal-entities.component.css',
})
export class LegalEntitiesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly legalEntityService = inject(LegalEntityService);
  private readonly fb = inject(FormBuilder);
  private readonly session = inject(SessionService);

  // ─── Estado ───────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly loadErrorMessage = signal<string | null>(null);
  readonly selectedEntity = signal<LegalEntityDto | null>(null);

  readonly legalEntities = this.legalEntityService.legalEntities;

  // ─── Formulário ───────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    cnpj: ['', [Validators.required, Validators.pattern(CNPJ_INPUT_PATTERN)]],
    corporateName: ['', [Validators.required, Validators.maxLength(255)]],
    tradeName: ['', Validators.maxLength(255)],
    stateRegistration: ['', Validators.maxLength(50)],
  });

  get cnpjControl() { return this.form.get('cnpj')!; }
  get corporateNameControl() { return this.form.get('corporateName')!; }
  get tradeNameControl() { return this.form.get('tradeName')!; }
  get stateRegistrationControl() { return this.form.get('stateRegistration')!; }

  constructor() {
    this.session.registerCleanup(() => {
      this.form.reset();
      this.closeModal();
      this.isSaving.set(false);
      this.isLoading.set(false);
      this.loadErrorMessage.set(null);
    }, this.destroyRef);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadEntities();
  }

  loadEntities(): void {
    this.isLoading.set(true);
    this.loadErrorMessage.set(null);
    this.legalEntityService.loadLegalEntities().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.isLoading.set(false),
      error: () => {
        this.isLoading.set(false);
        this.loadErrorMessage.set('Não foi possível carregar suas empresas. Tente novamente.');
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  readonly formatCnpj = formatCnpj;

  // ─── Modais ───────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.form.reset();
    this.errorMessage.set(null);
    this.selectedEntity.set(null);
    this.activeModal.set('create');
  }

  openEditModal(entity: LegalEntityDto): void {
    this.selectedEntity.set(entity);
    this.errorMessage.set(null);
    this.form.reset({
      cnpj: entity.cnpj,
      corporateName: entity.corporateName,
      tradeName: entity.tradeName ?? '',
      stateRegistration: entity.stateRegistration ?? '',
    });
    this.activeModal.set('edit');
  }

  openDeleteModal(entity: LegalEntityDto): void {
    this.selectedEntity.set(entity);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedEntity.set(null);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  save(): void {
    if (this.isSaving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const v = this.form.value;
    const payload = {
      cnpj: normalizeCnpj(v.cnpj!),
      corporateName: v.corporateName!,
      ...(v.tradeName ? { tradeName: v.tradeName } : {}),
      ...(v.stateRegistration ? { stateRegistration: v.stateRegistration } : {}),
    };

    const request$ = this.activeModal() === 'edit'
      ? this.legalEntityService.update(this.selectedEntity()!.id, payload)
      : this.legalEntityService.create(payload);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.applyFieldErrors(err);
        this.errorMessage.set(isUncertainCreation(err)
          ? 'Não foi possível confirmar se a empresa foi salva. Atualize a página e confira seus cadastros antes de enviar novamente.'
          : translateApiError(err?.error?.message, 'Erro ao salvar empresa.'));
      },
    });
  }

  delete(): void {
    if (this.isSaving()) return;
    const entity = this.selectedEntity();
    if (!entity) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.legalEntityService.delete(entity.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(isUncertainCreation(err)
          ? 'Não foi possível confirmar se a empresa foi excluída. Atualize a página e confira seus cadastros antes de tentar novamente.'
          : translateApiError(err?.error?.message, 'Erro ao excluir. Verifique se a empresa não está em uso.'));
      },
    });
  }

  private applyFieldErrors(error: HttpErrorResponse): void {
    if (error.status !== 400 || !Array.isArray(error.error?.errors)) return;
    for (const { field, message } of error.error.errors) {
      const control = this.form.get(field);
      if (!control || typeof message !== 'string') continue;
      control.setErrors({ ...control.errors, server: field === 'cnpj'
        ? 'Informe 12 letras ou números e 2 dígitos finais, com ou sem a máscara completa.'
        : message });
      control.markAsTouched();
    }
  }
}
