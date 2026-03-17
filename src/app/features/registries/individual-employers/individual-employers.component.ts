import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployerService } from '../../../core/services/employer.service';
import { IndividualEmployerDto } from '../../../core/models/legal-entity.model';
import { translateApiError } from '../../../core/utils/api-error.util';

type ModalType = 'create' | 'edit' | 'confirm-delete' | null;

@Component({
  selector: 'app-individual-employers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './individual-employers.component.html',
  styleUrl: './individual-employers.component.css',
})
export class IndividualEmployersComponent implements OnInit {
  private readonly employerService = inject(EmployerService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado ───────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedEmployer = signal<IndividualEmployerDto | null>(null);

  readonly employers = this.employerService.individualEmployers;

  // ─── Formulário ───────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    cpf: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(11), Validators.pattern(/^\d{11}$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  get cpfControl() { return this.form.get('cpf')!; }
  get nameControl() { return this.form.get('name')!; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.employerService.loadIndividualEmployers().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  formatCpf(cpf: string): string {
    return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  // ─── Modais ───────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.form.reset();
    this.errorMessage.set(null);
    this.selectedEmployer.set(null);
    this.activeModal.set('create');
  }

  openEditModal(employer: IndividualEmployerDto): void {
    this.selectedEmployer.set(employer);
    this.errorMessage.set(null);
    this.form.patchValue({ cpf: employer.cpf, name: employer.name });
    this.activeModal.set('edit');
  }

  openDeleteModal(employer: IndividualEmployerDto): void {
    this.selectedEmployer.set(employer);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedEmployer.set(null);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const payload = { cpf: this.form.value.cpf!, name: this.form.value.name! };

    const request$ = this.activeModal() === 'edit'
      ? this.employerService.updateIndividual(this.selectedEmployer()!.id, payload)
      : this.employerService.createIndividual(payload);

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

    this.employerService.deleteIndividual(employer.id).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir. Verifique se o empregador não está em uso.'));
      },
    });
  }
}