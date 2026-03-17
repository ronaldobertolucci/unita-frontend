import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { PocketsComponent } from './pockets.component';
import { PocketService } from '../../core/services/pocket.service';
import { PocketSummaryDto, BankAccountDto, BenefitAccountDto, FgtsEmployerAccountDto } from '../../core/models/pocket.model';

const mockSummaryBank: PocketSummaryDto = { id: 1, type: 'BANK_ACCOUNT', label: 'Banco X – Corrente', balance: 1500 };
const mockSummaryBenefit: PocketSummaryDto = { id: 2, type: 'BENEFIT_ACCOUNT', label: 'Empresa Y – VA', balance: 300 };
const mockSummaryFgts: PocketSummaryDto = { id: 3, type: 'FGTS_EMPLOYER_ACCOUNT', label: 'FGTS – Empresa Z', balance: 5000 };
const mockSummaryCash: PocketSummaryDto = { id: 4, type: 'CASH', label: 'Carteira', balance: 200 };

const mockBankAccount: BankAccountDto = {
  id: 1, legalEntityCorporateName: 'Banco X', number: '12345-6',
  agency: '0001', bankAccountType: 'Corrente', status: 'ACTIVE', balance: 1500,
};

const mockBenefitAccount: BenefitAccountDto = {
  id: 2, legalEntityCorporateName: 'Empresa Y',
  benefitType: 'Vale-Alimentação', status: 'ACTIVE', balance: 300,
};

const mockFgts: FgtsEmployerAccountDto = {
  id: 3, employerName: 'Empresa Z', admissionDate: '2020-01-01',
  dismissalDate: null, status: 'ACTIVE', balance: 5000,
};

function buildPocketService(pockets: PocketSummaryDto[] = []) {
  return {
    pockets: signal(pockets),
    loadPockets: jest.fn().mockReturnValue(of(pockets)),
    getLegalEntities: jest.fn().mockReturnValue(of([])),
    getIndividualEmployers: jest.fn().mockReturnValue(of([])),
    getLegalEntityEmployers: jest.fn().mockReturnValue(of([])),
    getBankAccount: jest.fn().mockReturnValue(of(mockBankAccount)),
    getBenefitAccount: jest.fn().mockReturnValue(of(mockBenefitAccount)),
    getFgts: jest.fn().mockReturnValue(of(mockFgts)),
    getCash: jest.fn().mockReturnValue(of({ id: 4, balance: 200 })),
    createBankAccount: jest.fn(),
    createBenefitAccount: jest.fn(),
    createFgts: jest.fn(),
    createCash: jest.fn(),
    updateBankAccount: jest.fn(),
    updateBenefitAccount: jest.fn(),
    updateFgts: jest.fn(),
    deleteBankAccount: jest.fn(),
    deleteBenefitAccount: jest.fn(),
    deleteFgts: jest.fn(),
    deleteCash: jest.fn(),
  };
}

describe('PocketsComponent', () => {
  let fixture: ComponentFixture<PocketsComponent>;
  let component: PocketsComponent;
  let pocketServiceSpy: ReturnType<typeof buildPocketService>;

  function setup(pockets: PocketSummaryDto[] = []) {
    pocketServiceSpy = buildPocketService(pockets);

    TestBed.configureTestingModule({
      imports: [PocketsComponent],
      providers: [{ provide: PocketService, useValue: pocketServiceSpy }],
    });

    fixture = TestBed.createComponent(PocketsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadPockets on init', () => {
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalled();
    });

    it('should start with no active modal', () => {
      expect(component.activeModal()).toBeNull();
    });

    it('should start with isLoading false after init', () => {
      expect(component.isLoading()).toBe(false);
    });
  });

  // ─── totalBalance() ───────────────────────────────────────────────────────

  describe('totalBalance()', () => {
    it('should return 0 when no pockets', () => {
      setup([]);
      expect(component.totalBalance()).toBe(0);
    });

    it('should sum all pocket balances', () => {
      setup([mockSummaryBank, mockSummaryBenefit, mockSummaryCash]);
      expect(component.totalBalance()).toBe(2000);
    });
  });

  // ─── hasCash() ────────────────────────────────────────────────────────────

  describe('hasCash()', () => {
    it('should return false when no cash pocket', () => {
      setup([mockSummaryBank]);
      expect(component.hasCash()).toBe(false);
    });

    it('should return true when cash pocket exists', () => {
      setup([mockSummaryBank, mockSummaryCash]);
      expect(component.hasCash()).toBe(true);
    });
  });

  // ─── openCreateModal() ────────────────────────────────────────────────────

  describe('openCreateModal()', () => {
    beforeEach(() => setup());

    it('should open type selection modal', () => {
      component.openCreateModal();
      expect(component.activeModal()).toBe('create-type-select');
    });

    it('should clear error message', () => {
      component.errorMessage.set('algum erro');
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── selectPocketType() ───────────────────────────────────────────────────

  describe('selectPocketType()', () => {
    beforeEach(() => setup());

    it('should open bank account form and load legal entities', () => {
      component.selectPocketType('BANK_ACCOUNT');
      expect(component.activeModal()).toBe('create-bank-account');
      expect(pocketServiceSpy.getLegalEntities).toHaveBeenCalled();
    });

    it('should open benefit account form and load legal entities', () => {
      component.selectPocketType('BENEFIT_ACCOUNT');
      expect(component.activeModal()).toBe('create-benefit-account');
      expect(pocketServiceSpy.getLegalEntities).toHaveBeenCalled();
    });

    it('should open fgts form and load employers', () => {
      component.selectPocketType('FGTS_EMPLOYER_ACCOUNT');
      expect(component.activeModal()).toBe('create-fgts');
      expect(pocketServiceSpy.getIndividualEmployers).toHaveBeenCalled();
      expect(pocketServiceSpy.getLegalEntityEmployers).toHaveBeenCalled();
    });

    it('should open cash confirm modal', () => {
      component.selectPocketType('CASH');
      expect(component.activeModal()).toBe('create-cash-confirm');
    });
  });

  // ─── openDetailModal() ────────────────────────────────────────────────────

  describe('openDetailModal()', () => {
    beforeEach(() => setup([mockSummaryBank, mockSummaryBenefit, mockSummaryFgts, mockSummaryCash]));

    it('should open bank account detail and load data', () => {
      component.openDetailModal(mockSummaryBank);
      expect(component.activeModal()).toBe('detail-bank-account');
      expect(pocketServiceSpy.getBankAccount).toHaveBeenCalledWith(1);
      expect(component.bankAccountDetail()).toEqual(mockBankAccount);
    });

    it('should open benefit account detail and load data', () => {
      component.openDetailModal(mockSummaryBenefit);
      expect(component.activeModal()).toBe('detail-benefit-account');
      expect(pocketServiceSpy.getBenefitAccount).toHaveBeenCalledWith(2);
      expect(component.benefitAccountDetail()).toEqual(mockBenefitAccount);
    });

    it('should open fgts detail and load data', () => {
      component.openDetailModal(mockSummaryFgts);
      expect(component.activeModal()).toBe('detail-fgts');
      expect(pocketServiceSpy.getFgts).toHaveBeenCalledWith(3);
      expect(component.fgtsDetail()).toEqual(mockFgts);
    });

    it('should open cash detail without API call', () => {
      component.openDetailModal(mockSummaryCash);
      expect(component.activeModal()).toBe('detail-cash');
      expect(component.selectedPocket()).toEqual(mockSummaryCash);
    });

    it('should prefill editBankAccountForm with current status', () => {
      component.openDetailModal(mockSummaryBank);
      expect(component.editBankAccountForm.value.status).toBe('ACTIVE');
    });

    it('should prefill editFgtsForm with current values', () => {
      component.openDetailModal(mockSummaryFgts);
      expect(component.editFgtsForm.value.status).toBe('ACTIVE');
      expect(component.editFgtsForm.value.dismissalDate).toBe('');
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup([mockSummaryBank]));

    it('should close modal and clear state', () => {
      component.openDetailModal(mockSummaryBank);
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedPocket()).toBeNull();
      expect(component.bankAccountDetail()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── createBankAccount() ──────────────────────────────────────────────────

  describe('createBankAccount()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.createBankAccount();
      expect(pocketServiceSpy.createBankAccount).not.toHaveBeenCalled();
      expect(component.bankAccountForm.touched).toBe(true);
    });

    it('should call createBankAccount and close modal on success', () => {
      pocketServiceSpy.createBankAccount.mockReturnValue(of(mockBankAccount));
      component.bankAccountForm.setValue({
        legalEntityId: 1, number: '12345-6', agency: '0001',
        bankAccountTypeId: 1, status: 'ACTIVE',
      });
      component.createBankAccount();
      expect(pocketServiceSpy.createBankAccount).toHaveBeenCalled();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      pocketServiceSpy.createBankAccount.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.bankAccountForm.setValue({
        legalEntityId: 1, number: '12345-6', agency: '0001',
        bankAccountTypeId: 1, status: 'ACTIVE',
      });
      component.createBankAccount();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── createCash() ─────────────────────────────────────────────────────────

  describe('createCash()', () => {
    beforeEach(() => setup());

    it('should call createCash and close modal on success', () => {
      pocketServiceSpy.createCash.mockReturnValue(of({ id: 4, balance: 0 }));
      component.createCash();
      expect(pocketServiceSpy.createCash).toHaveBeenCalled();
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      pocketServiceSpy.createCash.mockReturnValue(
        throwError(() => ({ error: { message: 'Já existe uma carteira' } }))
      );
      component.createCash();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── saveBankAccount() ────────────────────────────────────────────────────

  describe('saveBankAccount()', () => {
    beforeEach(() => setup([mockSummaryBank]));

    it('should call updateBankAccount and close modal on success', () => {
      pocketServiceSpy.updateBankAccount.mockReturnValue(of({ ...mockBankAccount, status: 'INACTIVE' }));
      component.openDetailModal(mockSummaryBank);
      component.editBankAccountForm.setValue({ status: 'INACTIVE' });
      component.saveBankAccount();
      expect(pocketServiceSpy.updateBankAccount).toHaveBeenCalledWith(1, { status: 'INACTIVE' });
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      pocketServiceSpy.updateBankAccount.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.openDetailModal(mockSummaryBank);
      component.saveBankAccount();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── deletePocket() ───────────────────────────────────────────────────────

  describe('deletePocket()', () => {
    it('should call deleteBankAccount for BANK_ACCOUNT pocket', () => {
      setup([mockSummaryBank]);
      pocketServiceSpy.deleteBankAccount.mockReturnValue(of(undefined));
      component.selectedPocket.set(mockSummaryBank);
      component.deletePocket();
      expect(pocketServiceSpy.deleteBankAccount).toHaveBeenCalledWith(1);
      expect(component.activeModal()).toBeNull();
    });

    it('should call deleteBenefitAccount for BENEFIT_ACCOUNT pocket', () => {
      setup([mockSummaryBenefit]);
      pocketServiceSpy.deleteBenefitAccount.mockReturnValue(of(undefined));
      component.selectedPocket.set(mockSummaryBenefit);
      component.deletePocket();
      expect(pocketServiceSpy.deleteBenefitAccount).toHaveBeenCalledWith(2);
    });

    it('should call deleteFgts for FGTS pocket', () => {
      setup([mockSummaryFgts]);
      pocketServiceSpy.deleteFgts.mockReturnValue(of(undefined));
      component.selectedPocket.set(mockSummaryFgts);
      component.deletePocket();
      expect(pocketServiceSpy.deleteFgts).toHaveBeenCalledWith(3);
    });

    it('should set errorMessage on failure', () => {
      setup([mockSummaryBank]);
      pocketServiceSpy.deleteBankAccount.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.selectedPocket.set(mockSummaryBank);
      component.deletePocket();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  describe('formatCurrency()', () => {
    beforeEach(() => setup());

    it('should format value as BRL currency', () => {
      expect(component.formatCurrency(1500)).toContain('1.500');
    });

    it('should handle undefined value gracefully', () => {
      expect(() => component.formatCurrency(undefined as any)).not.toThrow();
    });
  });

  describe('formatDate()', () => {
    beforeEach(() => setup());

    it('should convert yyyy-MM-dd to dd/MM/yyyy', () => {
      expect(component.formatDate('2020-01-15')).toBe('15/01/2020');
    });
  });

  describe('getPocketTypeLabel()', () => {
    beforeEach(() => setup());

    it('should return correct label for each type', () => {
      expect(component.getPocketTypeLabel('BANK_ACCOUNT')).toBe('Conta Bancária');
      expect(component.getPocketTypeLabel('BENEFIT_ACCOUNT')).toBe('Conta de Benefício');
      expect(component.getPocketTypeLabel('FGTS_EMPLOYER_ACCOUNT')).toBe('FGTS');
      expect(component.getPocketTypeLabel('CASH')).toBe('Carteira');
    });
  });

  describe('getStatusLabel()', () => {
    beforeEach(() => setup());

    it('should return correct label for each status', () => {
      expect(component.getStatusLabel('ACTIVE')).toBe('Ativa');
      expect(component.getStatusLabel('INACTIVE')).toBe('Inativa');
      expect(component.getStatusLabel('BLOCKED')).toBe('Bloqueada');
    });

    it('should return raw value for unknown status', () => {
      expect(component.getStatusLabel('UNKNOWN')).toBe('UNKNOWN');
    });
  });
});