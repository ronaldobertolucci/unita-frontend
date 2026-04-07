import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CreditCardService, CARD_BRANDS } from '../../core/services/credit-card.service';
import { LegalEntityService } from '../../core/services/legal-entity.service';
import { translateApiError } from '../../core/utils/api-error.util';
import { CreditCardDto, CardBrandDto } from '../../core/models/credit-card.model';
import { LegalEntityDto } from '../../core/models/legal-entity.model';

type ModalType = 'create' | 'detail' | 'confirm-update' | 'confirm-delete' | null;

@Component({
  selector: 'app-credit-cards',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-cards.component.html',
  styleUrl: './credit-cards.component.css',
})
export class CreditCardsComponent implements OnInit {
  private readonly creditCardService = inject(CreditCardService);
  private readonly legalEntityService = inject(LegalEntityService);
  private readonly fb = inject(FormBuilder);

  // ─── Estado da página ────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly isLoadingDetail = signal(false);
  readonly isLoadingRef = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // ─── Dados ───────────────────────────────────────────────────────────────

  readonly creditCards = this.creditCardService.creditCards;
  readonly cardBrands: CardBrandDto[] = CARD_BRANDS;
  readonly legalEntities = signal<LegalEntityDto[]>([]);
  readonly selectedCard = signal<CreditCardDto | null>(null);

  // ─── Formulários ─────────────────────────────────────────────────────────

  readonly createForm = this.fb.group({
    legalEntityId: [null as number | null, Validators.required],
    cardBrandId: [null as number | null, Validators.required],
    lastFourDigits: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]],
    creditLimit: [null as number | null, [Validators.required, Validators.min(0.01)]],
    closingDay: [null as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
    dueDay: [null as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
  });

  readonly editForm = this.fb.group({
    creditLimit: [null as number | null, [Validators.required, Validators.min(0.01)]],
    closingDay: [null as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
    dueDay: [null as number | null, [Validators.required, Validators.min(1), Validators.max(31)]],
  });

  // ─── Getters de controles ─────────────────────────────────────────────────

  get createLegalEntityId() { return this.createForm.get('legalEntityId')!; }
  get createCardBrandId() { return this.createForm.get('cardBrandId')!; }
  get createLastFourDigits() { return this.createForm.get('lastFourDigits')!; }
  get createCreditLimit() { return this.createForm.get('creditLimit')!; }
  get createClosingDay() { return this.createForm.get('closingDay')!; }
  get createDueDay() { return this.createForm.get('dueDay')!; }
  get editCreditLimit() { return this.editForm.get('creditLimit')!; }
  get editClosingDay() { return this.editForm.get('closingDay')!; }
  get editDueDay() { return this.editForm.get('dueDay')!; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.creditCardService.loadCreditCards().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Abertura de modais ───────────────────────────────────────────────────

  openCreateModal(): void {
    this.createForm.reset();
    this.errorMessage.set(null);
    this.loadLegalEntities();
    this.activeModal.set('create');
  }

  openDetailModal(card: CreditCardDto): void {
    this.selectedCard.set(card);
    this.errorMessage.set(null);
    this.editForm.patchValue({
      creditLimit: card.creditLimit,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
    });
    this.activeModal.set('detail');
  }

  openDeleteConfirm(): void {
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedCard.set(null);
  }

  // ─── Carregamento de referências ──────────────────────────────────────────

  private loadLegalEntities(): void {
    if (this.legalEntities().length > 0) return;
    this.isLoadingRef.set(true);
    this.legalEntityService.loadLegalEntities().subscribe({
      next: () => {
        this.legalEntities.set(this.legalEntityService.legalEntities());
        this.isLoadingRef.set(false);
      },
      error: () => this.isLoadingRef.set(false),
    });
  }

  // ─── Criação ─────────────────────────────────────────────────────────────

  createCreditCard(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.createForm.value;

    this.creditCardService.createCreditCard({
      legalEntityId: v.legalEntityId!,
      cardBrandId: v.cardBrandId!,
      lastFourDigits: v.lastFourDigits!,
      creditLimit: v.creditLimit!,
      closingDay: v.closingDay!,
      dueDay: v.dueDay!,
    }).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar cartão.'));
      },
    });
  }

  // ─── Edição ───────────────────────────────────────────────────────────────

  saveCreditCard(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const card = this.selectedCard()!;
    const v = this.editForm.value;
    const datesChanged = v.closingDay !== card.closingDay || v.dueDay !== card.dueDay;

    if (datesChanged) {
      this.errorMessage.set(null);
      this.activeModal.set('confirm-update');
    } else {
      this.executeSave();
    }
  }

  confirmSaveCreditCard(): void {
    this.executeSave();
  }

  backToDetail(): void {
    this.errorMessage.set(null);
    this.activeModal.set('detail');
  }

  private executeSave(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const id = this.selectedCard()!.id;
    const v = this.editForm.value;

    this.creditCardService.updateCreditCard(id, {
      creditLimit: v.creditLimit!,
      closingDay: v.closingDay!,
      dueDay: v.dueDay!,
    }).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.activeModal.set('detail');
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao atualizar cartão.'));
      },
    });
  }

  // ─── Exclusão ─────────────────────────────────────────────────────────────

  deleteCreditCard(): void {
    const card = this.selectedCard();
    if (!card) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.creditCardService.deleteCreditCard(card.id).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set('Ocorreu um erro ao excluir o cartão. Verifique se não há compras e estornos vinculados ao cartão. Se existir, não será possível excluir.');
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  getCardBrandName(card: CreditCardDto): string {
    return card.cardBrand;
  }

  cardTrackBy(_: number, card: CreditCardDto): number {
    return card.id;
  }
}