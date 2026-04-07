import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';

import { CreditCardsComponent } from './credit-cards.component';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LegalEntityService } from '../../core/services/legal-entity.service';
import { CreditCardDto } from '../../core/models/credit-card.model';
import { LegalEntityDto } from '../../core/models/legal-entity.model';

const mockCard: CreditCardDto = {
  id: 1,
  legalEntityCorporateName: 'Banco X',
  lastFourDigits: '1234',
  cardBrand: 'Visa',
  creditLimit: 5000,
  closingDay: 15,
  dueDay: 22,
};

const mockCard2: CreditCardDto = {
  id: 2,
  legalEntityCorporateName: 'Banco Y',
  lastFourDigits: '5678',
  cardBrand: 'Mastercard',
  creditLimit: 3000,
  closingDay: 10,
  dueDay: 20,
};

const mockLegalEntity: LegalEntityDto = {
  id: 1,
  cnpj: '12345678000190',
  corporateName: 'Banco X',
  tradeName: null,
  stateRegistration: null,
};

function buildCreditCardService(cards: CreditCardDto[] = []) {
  return {
    creditCards: signal(cards),
    loadCreditCards: jest.fn().mockReturnValue(of(cards)),
    getCreditCard: jest.fn().mockReturnValue(of(mockCard)),
    createCreditCard: jest.fn(),
    updateCreditCard: jest.fn(),
    deleteCreditCard: jest.fn(),
  };
}

function buildLegalEntityService(entities: LegalEntityDto[] = []) {
  return {
    legalEntities: signal(entities),
    loadLegalEntities: jest.fn().mockReturnValue(of(entities)),
  };
}

describe('CreditCardsComponent', () => {
  let fixture: ComponentFixture<CreditCardsComponent>;
  let component: CreditCardsComponent;
  let creditCardServiceSpy: ReturnType<typeof buildCreditCardService>;
  let legalEntityServiceSpy: ReturnType<typeof buildLegalEntityService>;

  function setup(cards: CreditCardDto[] = [], entities: LegalEntityDto[] = []) {
    creditCardServiceSpy = buildCreditCardService(cards);
    legalEntityServiceSpy = buildLegalEntityService(entities);

    TestBed.configureTestingModule({
      imports: [CreditCardsComponent, RouterTestingModule],
      providers: [
        { provide: CreditCardService, useValue: creditCardServiceSpy },
        { provide: LegalEntityService, useValue: legalEntityServiceSpy },
      ],
    });

    fixture = TestBed.createComponent(CreditCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadCreditCards on init', () => {
      expect(creditCardServiceSpy.loadCreditCards).toHaveBeenCalled();
    });

    it('should start with no active modal', () => {
      expect(component.activeModal()).toBeNull();
    });

    it('should start with isLoading false after init', () => {
      expect(component.isLoading()).toBe(false);
    });
  });

  // ─── openCreateModal() ────────────────────────────────────────────────────

  describe('openCreateModal()', () => {
    beforeEach(() => setup([], [mockLegalEntity]));

    it('should set activeModal to create', () => {
      component.openCreateModal();
      expect(component.activeModal()).toBe('create');
    });

    it('should clear errorMessage', () => {
      component.errorMessage.set('erro anterior');
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
    });

    it('should load legal entities if not cached', () => {
      component.openCreateModal();
      expect(legalEntityServiceSpy.loadLegalEntities).toHaveBeenCalled();
    });

    it('should not reload legal entities if already cached', () => {
      component.legalEntities.set([mockLegalEntity]);
      component.openCreateModal();
      expect(legalEntityServiceSpy.loadLegalEntities).not.toHaveBeenCalled();
    });
  });

  // ─── openDetailModal() ────────────────────────────────────────────────────

  describe('openDetailModal()', () => {
    beforeEach(() => setup([mockCard]));

    it('should set activeModal to detail', () => {
      component.openDetailModal(mockCard);
      expect(component.activeModal()).toBe('detail');
    });

    it('should set selectedCard', () => {
      component.openDetailModal(mockCard);
      expect(component.selectedCard()).toEqual(mockCard);
    });

    it('should prefill editForm with card values', () => {
      component.openDetailModal(mockCard);
      expect(component.editForm.value.closingDay).toBe(15);
      expect(component.editForm.value.dueDay).toBe(22);
      expect(component.editForm.value.creditLimit).toBe(5000);
    });
  });

  // ─── openDeleteConfirm() ──────────────────────────────────────────────────

  describe('openDeleteConfirm()', () => {
    beforeEach(() => setup([mockCard]));

    it('should set activeModal to confirm-delete', () => {
      component.openDetailModal(mockCard);
      component.openDeleteConfirm();
      expect(component.activeModal()).toBe('confirm-delete');
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup([mockCard]));

    it('should close modal and clear state', () => {
      component.openDetailModal(mockCard);
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedCard()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── createCreditCard() ───────────────────────────────────────────────────

  describe('createCreditCard()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.createCreditCard();
      expect(creditCardServiceSpy.createCreditCard).not.toHaveBeenCalled();
      expect(component.createForm.touched).toBe(true);
    });

    it('should call createCreditCard and close modal on success', () => {
      creditCardServiceSpy.createCreditCard.mockReturnValue(of(mockCard));
      component.createForm.setValue({
        legalEntityId: 1, cardBrandId: 1, lastFourDigits: '1234',
        creditLimit: 5000, closingDay: 15, dueDay: 22,
      });
      component.createCreditCard();
      expect(creditCardServiceSpy.createCreditCard).toHaveBeenCalledWith({
        legalEntityId: 1, cardBrandId: 1, lastFourDigits: '1234',
        creditLimit: 5000, closingDay: 15, dueDay: 22,
      });
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.createCreditCard.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.createForm.setValue({
        legalEntityId: 1, cardBrandId: 1, lastFourDigits: '1234',
        creditLimit: 5000, closingDay: 15, dueDay: 22,
      });
      component.createCreditCard();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── saveCreditCard() — sem mudança de datas ──────────────────────────────

  describe('saveCreditCard() — only creditLimit changed', () => {
    beforeEach(() => setup([mockCard]));

    it('should call executeSave directly without confirm-update modal', () => {
      creditCardServiceSpy.updateCreditCard.mockReturnValue(of({ ...mockCard, creditLimit: 8000 }));
      component.openDetailModal(mockCard);
      component.editForm.patchValue({ creditLimit: 8000 });
      component.saveCreditCard();
      expect(component.activeModal()).toBeNull();
      expect(creditCardServiceSpy.updateCreditCard).toHaveBeenCalledWith(1, {
        creditLimit: 8000, closingDay: 15, dueDay: 22,
      });
    });
  });

  // ─── saveCreditCard() — com mudança de datas ─────────────────────────────

  describe('saveCreditCard() — dates changed', () => {
    beforeEach(() => setup([mockCard]));

    it('should open confirm-update modal when closingDay changes', () => {
      component.openDetailModal(mockCard);
      component.editForm.patchValue({ closingDay: 10 });
      component.saveCreditCard();
      expect(component.activeModal()).toBe('confirm-update');
      expect(creditCardServiceSpy.updateCreditCard).not.toHaveBeenCalled();
    });

    it('should open confirm-update modal when dueDay changes', () => {
      component.openDetailModal(mockCard);
      component.editForm.patchValue({ dueDay: 25 });
      component.saveCreditCard();
      expect(component.activeModal()).toBe('confirm-update');
    });

    it('confirmSaveCreditCard() should call updateCreditCard and close modal', () => {
      creditCardServiceSpy.updateCreditCard.mockReturnValue(of({ ...mockCard, closingDay: 10 }));
      component.openDetailModal(mockCard);
      component.editForm.patchValue({ closingDay: 10 });
      component.saveCreditCard();
      component.confirmSaveCreditCard();
      expect(creditCardServiceSpy.updateCreditCard).toHaveBeenCalled();
      expect(component.activeModal()).toBeNull();
    });

    it('backToDetail() should return to detail modal', () => {
      component.openDetailModal(mockCard);
      component.editForm.patchValue({ closingDay: 10 });
      component.saveCreditCard();
      component.backToDetail();
      expect(component.activeModal()).toBe('detail');
    });

    it('should return to detail modal with error on save failure', () => {
      creditCardServiceSpy.updateCreditCard.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.openDetailModal(mockCard);
      component.editForm.patchValue({ closingDay: 10 });
      component.saveCreditCard();
      component.confirmSaveCreditCard();
      expect(component.activeModal()).toBe('detail');
      expect(component.errorMessage()).toBeTruthy();
    });
  });

  // ─── deleteCreditCard() ───────────────────────────────────────────────────

  describe('deleteCreditCard()', () => {
    beforeEach(() => setup([mockCard]));

    it('should call deleteCreditCard and close modal on success', () => {
      creditCardServiceSpy.deleteCreditCard.mockReturnValue(of(undefined));
      component.selectedCard.set(mockCard);
      component.deleteCreditCard();
      expect(creditCardServiceSpy.deleteCreditCard).toHaveBeenCalledWith(1);
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      creditCardServiceSpy.deleteCreditCard.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.selectedCard.set(mockCard);
      component.deleteCreditCard();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  describe('formatCurrency()', () => {
    beforeEach(() => setup());

    it('should format value as BRL currency', () => {
      expect(component.formatCurrency(5000)).toContain('5.000');
    });
  });
});