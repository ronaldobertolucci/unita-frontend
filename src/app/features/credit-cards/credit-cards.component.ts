import { financialErrorMessage, isUncertainFinancialWrite } from '../../core/utils/financial-operation.util';
import { FinancialRecoveryService } from '../../core/services/financial-recovery.service';
import { FinancialRecoveryComponent } from '../../shared/financial-recovery/financial-recovery.component';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionService } from '../../core/services/session.service';
import { RegistrationRecoveryService } from '../../core/services/registration-recovery.service';
import { isUnavailableRegistration, isUncertainCreation, REGISTRATION_UNAVAILABLE, registrationErrorMessage } from '../../core/utils/registration-error.util';
import { Component, inject, OnInit, OnDestroy, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CreditCardService, CARD_BRANDS } from '../../core/services/credit-card.service';
import { LegalEntityService } from '../../core/services/legal-entity.service';
import { translateApiError } from '../../core/utils/api-error.util';
import { CreditCardDto, CardBrandDto } from '../../core/models/credit-card.model';
import { LegalEntityDto } from '../../core/models/legal-entity.model';
import { PageContextService } from '../../core/services/page-context.service';

type ModalType = 'create' | 'detail' | 'confirm-update' | 'confirm-delete' | null;

@Component({
  selector: 'app-credit-cards',
  standalone: true,
  imports: [FinancialRecoveryComponent, CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-cards.component.html',
  styleUrl: './credit-cards.component.css',
})
export class CreditCardsComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  readonly financialRecovery = inject(FinancialRecoveryService);
  private readonly session = inject(SessionService);
  readonly recovery = inject(RegistrationRecoveryService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly legalEntityService = inject(LegalEntityService);
  private readonly fb = inject(FormBuilder);
  private pageContextService = inject(PageContextService);

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

  constructor() {
    this.session.registerCleanup(() => {
      this.legalEntities.set([]);
      this.createForm.reset();
      this.editForm.reset();
      this.isSaving.set(false);
      this.isLoadingRef.set(false);
      this.closeModal();
    }, this.destroyRef);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.creditCardService.loadCreditCards().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });

    this.pageContextService.pageSubtitle.set('Gerencie seus cartões, faturas e compras');
    this.pageContextService.ctaLabel.set('Novo cartão');
    this.pageContextService.ctaCallback.set(() => this.openCreateModal());
  }

  ngOnDestroy(): void {
    this.pageContextService.clear();
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
    this.legalEntities.set([]);
    this.isLoadingRef.set(true);
    this.legalEntityService.loadLegalEntities().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => {
        this.legalEntities.set(list);
        this.isLoadingRef.set(false);
      },
      error: () => this.isLoadingRef.set(false),
    });
  }

  // ─── Criação ─────────────────────────────────────────────────────────────

  createCreditCard(): void {
    if (this.isSaving() || this.isLoadingRef() || this.recovery.cards() !== 'clear') return;
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
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeModal();
        this.creditCardService.loadCreditCards().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {
          this.errorMessage.set('Cartão criado. Não foi possível atualizar a lista. Atualize a página.');
        } });
      },
      error: err => {
        this.isSaving.set(false);
        if (isUnavailableRegistration(err, 'legalEntity')) {
          this.errorMessage.set(REGISTRATION_UNAVAILABLE);
          this.createForm.patchValue({ legalEntityId: null });
          this.loadLegalEntities();
        } else if (isUncertainCreation(err)) {
          this.recovery.mark('cards');
          this.closeModal();
          this.checkCreationResult();
        } else {
          this.errorMessage.set(registrationErrorMessage(err, 'Erro ao criar cartão.'));
        }
      },
    });
  }

  checkCreationResult(): void {
    this.recovery.check('cards', () => this.creditCardService.loadCreditCards());
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
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    const card = this.selectedCard();
    if (!card) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.financialRecovery.trackWrite({ label: `Exclusão de cartão final ${card.lastFourDigits}`, pocketIds: [], cardId: card.id }, this.creditCardService.deleteCreditCard(card.id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.isSaving.set(false); this.closeModal(); },
      error: err => {
        this.isSaving.set(false);
        if (isUncertainFinancialWrite(err)) {
          this.closeModal();
          this.financialRecovery.mark({ label: `Exclusão de cartão final ${card.lastFourDigits}`, pocketIds: [], cardId: card.id });
          this.financialRecovery.check();
        } else {
          this.errorMessage.set(financialErrorMessage(err, 'card', 'Erro ao excluir. Verifique os vínculos deste recurso.'));
          this.creditCardService.loadCreditCards().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
          this.creditCardService.getBills(card.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
        }
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