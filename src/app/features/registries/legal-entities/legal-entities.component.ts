import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { LegalEntityDto } from '../../../core/models/legal-entity.model';
import { translateApiError } from '../../../core/utils/api-error.util';

type ModalType = 'create' | 'edit' | 'confirm-delete' | null;

@Component({
  selector: 'app-legal-entities',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './legal-entities.component.html',
  styleUrl: './legal-entities.component.css',
})
export class LegalEntitiesComponent implements OnInit {
  private readonly legalEntityService = inject(LegalEntityService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado ───────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedEntity = signal<LegalEntityDto | null>(null);

  readonly legalEntities = this.legalEntityService.legalEntities;

  // ─── Formulário ───────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    cnpj: ['', [Validators.required, Validators.minLength(14), Validators.maxLength(14), Validators.pattern(/^\d{14}$/)]],
    corporateName: ['', [Validators.required, Validators.maxLength(255)]],
    tradeName: ['', Validators.maxLength(255)],
    stateRegistration: ['', Validators.maxLength(50)],
  });

  get cnpjControl() { return this.form.get('cnpj')!; }
  get corporateNameControl() { return this.form.get('corporateName')!; }
  get tradeNameControl() { return this.form.get('tradeName')!; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.legalEntityService.loadLegalEntities().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  formatCnpj(cnpj: string): string {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

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
    this.form.patchValue({
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const v = this.form.value;
    const payload = {
      cnpj: v.cnpj!,
      corporateName: v.corporateName!,
      ...(v.tradeName ? { tradeName: v.tradeName } : {}),
      ...(v.stateRegistration ? { stateRegistration: v.stateRegistration } : {}),
    };

    const request$ = this.activeModal() === 'edit'
      ? this.legalEntityService.update(this.selectedEntity()!.id, payload)
      : this.legalEntityService.create(payload);

    request$.subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao salvar empresa.'));
      },
    });
  }

  delete(): void {
    const entity = this.selectedEntity();
    if (!entity) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.legalEntityService.delete(entity.id).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir. Verifique se a empresa não está em uso.'));
      },
    });
  }
}