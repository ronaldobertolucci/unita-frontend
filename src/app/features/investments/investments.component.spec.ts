import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { of, throwError } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';

registerLocaleData(localePt, 'pt-BR');

import { InvestmentsComponent } from './investments.component';
import { AssetService } from '../../core/services/asset.service';
import { LegalEntityService } from '../../core/services/legal-entity.service';
import { AssetSummaryDto } from '../../core/models/asset.model';
import { LegalEntityDto } from '../../core/models/legal-entity.model';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockAsset: AssetSummaryDto = {
  id: 1,
  name: 'CDB Banco X',
  category: 'RENDA_FIXA',
  status: 'ACTIVE',
  legalEntityName: 'Banco X',
  custodianLegalEntityName: 'Custodiante A',
  currentValue: 10500,
  totalInvested: 10000,
  redeemedValue: 0,
};

const mockAssetMatured: AssetSummaryDto = {
  id: 2,
  name: 'LCI Banco Y',
  category: 'RENDA_FIXA',
  status: 'MATURED',
  legalEntityName: 'Banco Y',
  custodianLegalEntityName: 'Custodiante B',
  currentValue: 5200,
  totalInvested: 5000,
  redeemedValue: 0,
};

const mockAssetRedeemed: AssetSummaryDto = {
  id: 3,
  name: 'PGBL Banco Y',
  category: 'PREVIDENCIA',
  status: 'REDEEMED',
  legalEntityName: 'Banco Y',
  custodianLegalEntityName: 'Custodiante A',
  currentValue: 0,
  totalInvested: 5000,
  redeemedValue: 5300,
};

const mockAssetNoCustodian: AssetSummaryDto = {
  id: 4,
  name: 'CDB Banco Z',
  category: 'RENDA_FIXA',
  status: 'ACTIVE',
  legalEntityName: 'Banco Z',
  custodianLegalEntityName: null,
  currentValue: 1000,
  totalInvested: 1000,
  redeemedValue: 0,
};

const mockLegalEntity: LegalEntityDto = {
  id: 1,
  cnpj: '12345678000190',
  corporateName: 'Banco X',
  tradeName: null,
  stateRegistration: null,
};

const mockLegalEntity2: LegalEntityDto = {
  id: 2,
  cnpj: '98765432000111',
  corporateName: 'Custodiante A LTDA',
  tradeName: 'Custodiante A',
  stateRegistration: null,
};

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildAssetService(assets: AssetSummaryDto[] = []) {
  return {
    assets: signal(assets),
    isLoading: signal(false),
    loadAssets: jest.fn(),
    createFixedIncome: jest.fn(),
    createPension: jest.fn(),
  };
}

function buildLegalEntityService(entities: LegalEntityDto[] = []) {
  return {
    legalEntities: signal(entities),
    loadLegalEntities: jest.fn().mockReturnValue(of(entities)),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('InvestmentsComponent', () => {
  let fixture: ComponentFixture<InvestmentsComponent>;
  let component: InvestmentsComponent;
  let assetServiceSpy: ReturnType<typeof buildAssetService>;
  let legalEntityServiceSpy: ReturnType<typeof buildLegalEntityService>;
  let router: Router;

  function setup(assets: AssetSummaryDto[] = [], entities: LegalEntityDto[] = []) {
    assetServiceSpy = buildAssetService(assets);
    legalEntityServiceSpy = buildLegalEntityService(entities);

    TestBed.configureTestingModule({
      imports: [InvestmentsComponent, RouterTestingModule],
      providers: [
        { provide: AssetService, useValue: assetServiceSpy },
        { provide: LegalEntityService, useValue: legalEntityServiceSpy },
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    });

    fixture = TestBed.createComponent(InvestmentsComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadAssets on init', () => {
      expect(assetServiceSpy.loadAssets).toHaveBeenCalled();
    });

    it('should call loadLegalEntities on init', () => {
      expect(legalEntityServiceSpy.loadLegalEntities).toHaveBeenCalled();
    });

    it('should start with modal closed', () => {
      expect(component.modalOpen()).toBe(false);
    });

    it('should start with fixed-income tab active', () => {
      expect(component.activeTab()).toBe('fixed-income');
    });

    it('should start with redeemedVisible false', () => {
      expect(component.redeemedVisible()).toBe(false);
    });

    it('should start with selectedCustodianName null', () => {
      expect(component.selectedCustodianName()).toBeNull();
    });
  });

  // ─── activeAssets ─────────────────────────────────────────────────────────

  describe('activeAssets', () => {
    it('should include ACTIVE and MATURED assets', () => {
      setup([mockAsset, mockAssetMatured, mockAssetRedeemed]);
      const result = component.activeAssets();
      expect(result.length).toBe(2);
      expect(result.find(a => a.status === 'REDEEMED')).toBeUndefined();
    });

    it('should return empty when all assets are REDEEMED', () => {
      setup([mockAssetRedeemed]);
      expect(component.activeAssets()).toEqual([]);
    });

    it('should return all non-redeemed when no custodian filter', () => {
      setup([mockAsset, mockAssetMatured, mockAssetRedeemed]);
      expect(component.activeAssets().length).toBe(2);
    });

    it('should filter by selectedCustodianName', () => {
      setup([mockAsset, mockAssetMatured, mockAssetRedeemed]);
      component.selectedCustodianName.set('Custodiante A');
      // mockAsset has custodianA, mockAssetMatured has custodianB
      const result = component.activeAssets();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockAsset.id);
    });

    it('should show all active assets when custodian filter is reset to null', () => {
      setup([mockAsset, mockAssetMatured]);
      component.selectedCustodianName.set('Custodiante A');
      component.selectedCustodianName.set(null);
      expect(component.activeAssets().length).toBe(2);
    });
  });

  // ─── redeemedAssets ───────────────────────────────────────────────────────

  describe('redeemedAssets', () => {
    it('should include only REDEEMED assets', () => {
      setup([mockAsset, mockAssetRedeemed]);
      expect(component.redeemedAssets().length).toBe(1);
      expect(component.redeemedAssets()[0].status).toBe('REDEEMED');
    });

    it('should return empty when no redeemed assets', () => {
      setup([mockAsset]);
      expect(component.redeemedAssets()).toEqual([]);
    });

    it('should filter redeemed assets by selectedCustodianName', () => {
      const redeemedB: AssetSummaryDto = {
        ...mockAssetRedeemed,
        id: 99,
        custodianLegalEntityName: 'Custodiante B',
      };
      setup([mockAssetRedeemed, redeemedB]);
      component.selectedCustodianName.set('Custodiante A');
      expect(component.redeemedAssets().length).toBe(1);
      expect(component.redeemedAssets()[0].custodianLegalEntityName).toBe('Custodiante A');
    });
  });

  // ─── redeemedVisible ──────────────────────────────────────────────────────

  describe('redeemedVisible', () => {
    beforeEach(() => setup([mockAsset, mockAssetRedeemed]));

    it('should toggle redeemedVisible', () => {
      component.redeemedVisible.set(true);
      expect(component.redeemedVisible()).toBe(true);
      component.redeemedVisible.set(false);
      expect(component.redeemedVisible()).toBe(false);
    });
  });

  // ─── availableCustodians ──────────────────────────────────────────────────

  describe('availableCustodians', () => {
    it('should extract unique custodian names from all assets', () => {
      setup([mockAsset, mockAssetMatured, mockAssetRedeemed]);
      // mockAsset → Custodiante A, mockAssetMatured → Custodiante B, mockAssetRedeemed → Custodiante A
      expect(component.availableCustodians().length).toBe(2);
      expect(component.availableCustodians()).toContain('Custodiante A');
      expect(component.availableCustodians()).toContain('Custodiante B');
    });

    it('should sort custodians alphabetically', () => {
      setup([mockAssetMatured, mockAsset]); // B before A order in array
      const result = component.availableCustodians();
      expect(result[0]).toBe('Custodiante A');
      expect(result[1]).toBe('Custodiante B');
    });

    it('should exclude assets without custodian', () => {
      setup([mockAsset, mockAssetNoCustodian]);
      expect(component.availableCustodians().length).toBe(1);
      expect(component.availableCustodians()[0]).toBe('Custodiante A');
    });

    it('should return empty when no assets have custodians', () => {
      setup([mockAssetNoCustodian]);
      expect(component.availableCustodians()).toEqual([]);
    });

    it('should return empty when no assets', () => {
      setup([]);
      expect(component.availableCustodians()).toEqual([]);
    });
  });

  // ─── selectedCustodianName filtering ─────────────────────────────────────

  describe('selectedCustodianName filtering', () => {
    beforeEach(() => setup([mockAsset, mockAssetMatured, mockAssetRedeemed]));

    it('should show all sections when null (no filter)', () => {
      expect(component.activeAssets().length).toBe(2);
      expect(component.redeemedAssets().length).toBe(1);
    });

    it('should filter both active and redeemed sections simultaneously', () => {
      component.selectedCustodianName.set('Custodiante A');
      // active: only mockAsset (Custodiante A), not mockAssetMatured (Custodiante B)
      expect(component.activeAssets().length).toBe(1);
      // redeemed: mockAssetRedeemed (Custodiante A)
      expect(component.redeemedAssets().length).toBe(1);
    });

    it('should return empty sections when custodian has no matching assets', () => {
      component.selectedCustodianName.set('Custodiante Inexistente');
      expect(component.activeAssets()).toEqual([]);
      expect(component.redeemedAssets()).toEqual([]);
    });
  });

  // ─── openModal() ──────────────────────────────────────────────────────────

  describe('openModal()', () => {
    beforeEach(() => setup());

    it('should open modal', () => {
      component.openModal();
      expect(component.modalOpen()).toBe(true);
    });

    it('should reset to fixed-income tab', () => {
      component.setTab('pension');
      component.openModal();
      expect(component.activeTab()).toBe('fixed-income');
    });

    it('should clear errorMessage', () => {
      component.errorMessage.set('erro anterior');
      component.openModal();
      expect(component.errorMessage()).toBe('');
    });

    it('should rebuild forms including custodianLegalEntityId', () => {
      component.openModal();
      expect(component.fixedIncomeForm.contains('custodianLegalEntityId')).toBe(true);
      expect(component.pensionForm.contains('custodianLegalEntityId')).toBe(true);
    });

    it('should initialize custodianLegalEntityId as null', () => {
      component.openModal();
      expect(component.fixedIncomeForm.get('custodianLegalEntityId')?.value).toBeNull();
      expect(component.pensionForm.get('custodianLegalEntityId')?.value).toBeNull();
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup());

    it('should close modal', () => {
      component.openModal();
      component.closeModal();
      expect(component.modalOpen()).toBe(false);
    });
  });

  // ─── setTab() ─────────────────────────────────────────────────────────────

  describe('setTab()', () => {
    beforeEach(() => setup());

    it('should switch to pension tab', () => {
      component.setTab('pension');
      expect(component.activeTab()).toBe('pension');
    });

    it('should clear errorMessage on tab switch', () => {
      component.errorMessage.set('erro');
      component.setTab('pension');
      expect(component.errorMessage()).toBe('');
    });
  });

  // ─── openDetail() ─────────────────────────────────────────────────────────

  describe('openDetail()', () => {
    beforeEach(() => setup([mockAsset]));

    it('should navigate to /investments/:id', () => {
      const spy = jest.spyOn(router, 'navigate');
      component.openDetail(1);
      expect(spy).toHaveBeenCalledWith(['/investments', 1]);
    });
  });

  // ─── displayValue() ───────────────────────────────────────────────────────

  describe('displayValue()', () => {
    beforeEach(() => setup());

    it('should return currentValue for ACTIVE asset', () => {
      expect(component.displayValue(mockAsset)).toBe(10500);
    });

    it('should return redeemedValue for REDEEMED asset', () => {
      expect(component.displayValue(mockAssetRedeemed)).toBe(5300);
    });
  });

  // ─── variation() ──────────────────────────────────────────────────────────

  describe('variation()', () => {
    beforeEach(() => setup());

    it('should calculate variation based on currentValue for ACTIVE asset', () => {
      expect(component.variation(mockAsset)).toBeCloseTo(5, 0);
    });

    it('should calculate variation based on redeemedValue for REDEEMED asset', () => {
      expect(component.variation(mockAssetRedeemed)).toBeCloseTo(6, 0);
    });

    it('should return 0 when totalInvested is 0', () => {
      expect(component.variation({ ...mockAsset, totalInvested: 0 })).toBe(0);
    });
  });

  // ─── categoryLabel() / statusLabel() ──────────────────────────────────────

  describe('helpers', () => {
    beforeEach(() => setup());

    it('categoryLabel should return "Renda Fixa" for RENDA_FIXA', () => {
      expect(component.categoryLabel('RENDA_FIXA')).toBe('Renda Fixa');
    });

    it('categoryLabel should return "Previdência" for PREVIDENCIA', () => {
      expect(component.categoryLabel('PREVIDENCIA')).toBe('Previdência');
    });

    it('statusLabel should map all statuses', () => {
      expect(component.statusLabel('ACTIVE')).toBe('Ativo');
      expect(component.statusLabel('MATURED')).toBe('Vencido');
      expect(component.statusLabel('REDEEMED')).toBe('Resgatado');
    });
  });

  // ─── onSubmit() — Renda Fixa ──────────────────────────────────────────────

  describe('onSubmit() — fixed income', () => {
    beforeEach(() => setup([], [mockLegalEntity]));

    it('should not submit when form is invalid', () => {
      component.openModal();
      component.onSubmit();
      expect(assetServiceSpy.createFixedIncome).not.toHaveBeenCalled();
      expect(component.fixedIncomeForm.touched).toBe(true);
    });

    it('should call createFixedIncome with custodianLegalEntityId on success', () => {
      assetServiceSpy.createFixedIncome.mockReturnValue(of({}));
      component.openModal();
      component.fixedIncomeForm.setValue({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 12.5, maturityDate: '2027-01-15', taxFree: false,
        custodianLegalEntityId: 1,
      });
      component.onSubmit();
      expect(assetServiceSpy.createFixedIncome).toHaveBeenCalledWith({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 12.5, maturityDate: '2027-01-15', taxFree: false,
        custodianLegalEntityId: 1,
      });
      expect(component.modalOpen()).toBe(false);
      expect(component.isSaving()).toBe(false);
    });

    it('should send custodianLegalEntityId as undefined when null', () => {
      assetServiceSpy.createFixedIncome.mockReturnValue(of({}));
      component.openModal();
      component.fixedIncomeForm.setValue({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 12.5, maturityDate: '2027-01-15', taxFree: false,
        custodianLegalEntityId: null,
      });
      component.onSubmit();
      const [payload] = assetServiceSpy.createFixedIncome.mock.calls[0];
      expect(payload.custodianLegalEntityId).toBeNull();
    });

    it('should custodianLegalEntityId be optional — form is valid without it', () => {
      component.openModal();
      component.fixedIncomeForm.patchValue({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 12.5, maturityDate: '2027-01-15',
      });
      // custodianLegalEntityId is null (not set)
      expect(component.fixedIncomeForm.get('custodianLegalEntityId')?.valid).toBe(true);
    });

    it('should set errorMessage and stop saving on error', () => {
      assetServiceSpy.createFixedIncome.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } })),
      );
      component.openModal();
      component.fixedIncomeForm.setValue({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 12.5, maturityDate: '2027-01-15', taxFree: false,
        custodianLegalEntityId: 1,
      });
      component.onSubmit();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
      expect(component.modalOpen()).toBe(true);
    });
  });

  // ─── onSubmit() — Previdência ─────────────────────────────────────────────

  describe('onSubmit() — pension', () => {
    beforeEach(() => setup([], [mockLegalEntity]));

    it('should not submit when pension form is invalid', () => {
      component.openModal();
      component.setTab('pension');
      component.onSubmit();
      expect(assetServiceSpy.createPension).not.toHaveBeenCalled();
    });

    it('should call createPension with custodianLegalEntityId on success', () => {
      assetServiceSpy.createPension.mockReturnValue(of({}));
      component.openModal();
      component.setTab('pension');
      component.pensionForm.setValue({
        name: 'PGBL Banco X', legalEntityId: 1,
        pensionType: 'PGBL', taxRegime: 'PROGRESSIVO',
        custodianLegalEntityId: 1,
      });
      component.onSubmit();
      expect(assetServiceSpy.createPension).toHaveBeenCalledWith({
        name: 'PGBL Banco X', legalEntityId: 1,
        pensionType: 'PGBL', taxRegime: 'PROGRESSIVO',
        custodianLegalEntityId: 1,
      });
      expect(component.modalOpen()).toBe(false);
      expect(component.isSaving()).toBe(false);
    });

    it('should send custodianLegalEntityId as undefined when null', () => {
      assetServiceSpy.createPension.mockReturnValue(of({}));
      component.openModal();
      component.setTab('pension');
      component.pensionForm.setValue({
        name: 'PGBL Banco X', legalEntityId: 1,
        pensionType: 'PGBL', taxRegime: 'PROGRESSIVO',
        custodianLegalEntityId: null,
      });
      component.onSubmit();
      const [payload] = assetServiceSpy.createPension.mock.calls[0];
      expect(payload.custodianLegalEntityId).toBeNull();
    });

    it('should set errorMessage and stop saving on error', () => {
      assetServiceSpy.createPension.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } })),
      );
      component.openModal();
      component.setTab('pension');
      component.pensionForm.setValue({
        name: 'PGBL Banco X', legalEntityId: 1,
        pensionType: 'PGBL', taxRegime: 'PROGRESSIVO',
        custodianLegalEntityId: null,
      });
      component.onSubmit();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });
});