import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployerService } from '../../../core/services/employer.service';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { LegalEntityEmployerDto, LegalEntityDto } from '../../../core/models/legal-entity.model';
import { translateApiError } from '../../../core/utils/api-error.util';

type ModalType = 'create' | 'edit' | 'confirm-delete' | null;

@Component({
  selector: 'app-legal-entity-employers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './legal-entity-employers.component.html',
  styleUrl: './legal-entity-employers.component.css',
})
export class LegalEntityEmployersComponent implements OnInit {
  private readonly employerService = inject(EmployerService);
  private readonly legalEntityService = inject(LegalEntityService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado ───────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly isLoadingEntities = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedEmployer = signal<LegalEntityEmployerDto | null>(null);

  readonly employers = this.employerService.legalEntityEmployers;
  readonly legalEntities = signal<LegalEntityDto[]>([]);

  // ─── Formulário ───────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    legalEntityId: [null as number | null, Validators.required],
  });

  get legalEntityIdControl() { return this.form.get('legalEntityId')!; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.employerService.loadLegalEntityEmployers().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Modais ───────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.form.reset();
    this.errorMessage.set(null);
    this.selectedEmployer.set(null);
    this.activeModal.set('create');
    this.loadLegalEntities();
  }

  openEditModal(employer: LegalEntityEmployerDto): void {
    this.selectedEmployer.set(employer);
    this.errorMessage.set(null);
    this.form.patchValue({ legalEntityId: employer.legalEntity.id });
    this.activeModal.set('edit');
    this.loadLegalEntities();
  }

  openDeleteModal(employer: LegalEntityEmployerDto): void {
    this.selectedEmployer.set(employer);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedEmployer.set(null);
  }

  // ─── Carregamento de legal entities ──────────────────────────────────────

  private loadLegalEntities(): void {
    if (this.legalEntities().length > 0) return;
    this.isLoadingEntities.set(true);
    this.legalEntityService.loadLegalEntities().subscribe({
      next: list => { this.legalEntities.set(list); this.isLoadingEntities.set(false); },
      error: () => this.isLoadingEntities.set(false),
    });
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const payload = { legalEntityId: this.form.value.legalEntityId! };

    const request$ = this.activeModal() === 'edit'
      ? this.employerService.updateLegalEntity(this.selectedEmployer()!.id, payload)
      : this.employerService.createLegalEntity(payload);

    request$.subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao salvar empregador.'));
      },
    });
  }

  delete(): void {
    const employer = this.selectedEmployer();
    if (!employer) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.employerService.deleteLegalEntity(employer.id).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir. Verifique se o empregador não está em uso.'));
      },
    });
  }
}