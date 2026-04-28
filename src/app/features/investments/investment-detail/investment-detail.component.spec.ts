import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { of, throwError } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';

registerLocaleData(localePt, 'pt-BR');

import { InvestmentDetailComponent } from './investment-detail.component';
import { AssetService } from '../../../core/services/asset.service';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { CategoryService } from '../../../core/services/category.service';
import { PocketService } from '../../../core/services/pocket.service';
import { AssetDetailDto, InvestmentTransactionDto } from '../../../core/models/asset.model';
import { CategoryDto } from '../../../core/models/category.model';
import { PocketSummaryDto } from '../../../core/models/pocket.model';
import { LegalEntityDto } from '../../../core/models/legal-entity.model';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCustodianLegalEntity: LegalEntityDto = {
  id: 2, cnpj: '98765432000111', corporateName: 'Custodiante A LTDA',
  tradeName: 'Custodiante A', stateRegistration: null,
};

const mockDetail: AssetDetailDto = {
  id: 1,
  name: 'CDB Banco X',
  category: 'RENDA_FIXA',
  status: 'ACTIVE',
  legalEntity: {
    id: 1, cnpj: '12345678000190',
    corporateName: 'Banco X LTDA', tradeName: 'Banco X', stateRegistration: null,
  },
  custodianLegalEntity: null,
  position: {
    quantity: 1, averagePrice: 10000, totalInvested: 10000,
    currentValue: 10500, redeemedValue: 0, lastValuationDate: '2025-01-15',
  },
  fixedIncomeDetails: {
    indexer: 'CDI', annualRate: 0.12, maturityDate: '2027-01-15', taxFree: false,
  },
  pensionDetails: null,
};

const mockDetailWithCustodian: AssetDetailDto = {
  ...mockDetail,
  custodianLegalEntity: mockCustodianLegalEntity,
};

const mockDetailRedeemed: AssetDetailDto = {
  ...mockDetail,
  status: 'REDEEMED',
  custodianLegalEntity: null,
  position: { ...mockDetail.position, currentValue: 0, redeemedValue: 10800 },
};

const mockTxBuy: InvestmentTransactionDto = {
  id: 10, type: 'BUY', amount: 10000, transactionDate: '2024-01-15', notes: null,
};

const mockTxYield: InvestmentTransactionDto = {
  id: 11, type: 'YIELD', amount: 500, transactionDate: '2025-01-10', notes: 'Rendimento mensal',
};

const mockTxSell: InvestmentTransactionDto = {
  id: 12, type: 'SELL', amount: 10500, transactionDate: '2025-02-01', notes: null,
};

const mockTxTax: InvestmentTransactionDto = {
  id: 13, type: 'TAX', amount: 150, transactionDate: '2025-02-01', notes: null,
};

const mockCategoryBuy: CategoryDto  = { id: 11, name: 'Aporte em Investimento',    type: 'EXPENSE', global: true };
const mockCategoryYield: CategoryDto = { id: 12, name: 'Rendimento de Investimento', type: 'INCOME', global: true };
const mockCategorySell: CategoryDto  = { id: 13, name: 'Resgate de Investimento',    type: 'EXPENSE', global: true };

const mockPocket: PocketSummaryDto      = { id: 5, type: 'BANK_ACCOUNT',   label: 'Banco X – Corrente', balance: 1000 };
const mockPocketCash: PocketSummaryDto  = { id: 6, type: 'CASH',           label: 'Carteira',           balance: 200  };
const mockPocketBenefit: PocketSummaryDto = { id: 7, type: 'BENEFIT_ACCOUNT', label: 'VA Empresa',       balance: 500  };

const mockLegalEntity: LegalEntityDto = {
  id: 1, cnpj: '12345678000190', corporateName: 'Banco X', tradeName: null, stateRegistration: null,
};

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildAssetService(detail: AssetDetailDto = mockDetail, txs: InvestmentTransactionDto[] = []) {
  return {
    getAsset:       jest.fn().mockReturnValue(of(detail)),
    getTransactions: jest.fn().mockReturnValue(of(txs)),
    assets:         signal([]),
    updateAsset:    jest.fn(),
    deleteAsset:    jest.fn(),
    updatePosition: jest.fn(),
    buy:            jest.fn(),
    recordYield:    jest.fn(),
    sell:           jest.fn(),
  };
}

function buildCategoryService(categories: CategoryDto[] = []) {
  return {
    categories:      signal(categories),
    loadCategories:  jest.fn().mockReturnValue(of(categories)),
  };
}

function buildPocketService(pockets: PocketSummaryDto[] = []) {
  return {
    pockets:      signal(pockets),
    loadPockets:  jest.fn().mockReturnValue(of(pockets)),
  };
}

function buildLegalEntityService(entities: LegalEntityDto[] = []) {
  return {
    legalEntities:      signal(entities),
    loadLegalEntities:  jest.fn().mockReturnValue(of(entities)),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('InvestmentDetailComponent', () => {
  let fixture: ComponentFixture<InvestmentDetailComponent>;
  let component: InvestmentDetailComponent;
  let assetServiceSpy: ReturnType<typeof buildAssetService>;
  let categoryServiceSpy: ReturnType<typeof buildCategoryService>;
  let pocketServiceSpy: ReturnType<typeof buildPocketService>;
  let legalEntityServiceSpy: ReturnType<typeof buildLegalEntityService>;
  let router: Router;

  function setup(
    detail: AssetDetailDto = mockDetail,
    txs: InvestmentTransactionDto[] = [],
    categories: CategoryDto[] = [mockCategoryBuy, mockCategoryYield, mockCategorySell],
    pockets: PocketSummaryDto[] = [mockPocket, mockPocketCash, mockPocketBenefit],
    entities: LegalEntityDto[] = [mockLegalEntity, mockCustodianLegalEntity],
  ) {
    assetServiceSpy      = buildAssetService(detail, txs);
    categoryServiceSpy   = buildCategoryService(categories);
    pocketServiceSpy     = buildPocketService(pockets);
    legalEntityServiceSpy = buildLegalEntityService(entities);

    TestBed.configureTestingModule({
      imports: [InvestmentDetailComponent, RouterTestingModule],
      providers: [
        { provide: AssetService,       useValue: assetServiceSpy       },
        { provide: CategoryService,    useValue: categoryServiceSpy    },
        { provide: PocketService,      useValue: pocketServiceSpy      },
        { provide: LegalEntityService, useValue: legalEntityServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    });

    fixture   = TestBed.createComponent(InvestmentDetailComponent);
    component = fixture.componentInstance;
    router    = TestBed.inject(Router);
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should load asset on init', () => {
      expect(assetServiceSpy.getAsset).toHaveBeenCalledWith(1);
      expect(component.asset()).toEqual(mockDetail);
    });

    it('should load transactions on init', () => {
      expect(assetServiceSpy.getTransactions).toHaveBeenCalledWith(1);
    });

    it('should load categories, pockets and legal entities on init', () => {
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalled();
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalled();
      expect(legalEntityServiceSpy.loadLegalEntities).toHaveBeenCalled();
    });

    it('should redirect to /investments if asset not found', () => {
      assetServiceSpy.getAsset.mockReturnValue(throwError(() => ({ status: 404 })));
      const spy = jest.spyOn(router, 'navigate');
      fixture = TestBed.createComponent(InvestmentDetailComponent);
      fixture.detectChanges();
      expect(spy).toHaveBeenCalledWith(['/investments']);
    });
  });

  // ─── variation() / displayCurrentValue ───────────────────────────────────

  describe('variation()', () => {
    it('should calculate based on currentValue for ACTIVE asset', () => {
      setup();
      expect(component.variation()).toBeCloseTo(5, 0);
    });

    it('should calculate based on redeemedValue for REDEEMED asset', () => {
      setup(mockDetailRedeemed);
      expect(component.variation()).toBeCloseTo(8, 0);
    });

    it('should return 0 when totalInvested is 0', () => {
      setup({ ...mockDetail, position: { ...mockDetail.position, totalInvested: 0 } });
      expect(component.variation()).toBe(0);
    });
  });

  describe('displayCurrentValue', () => {
    it('should return currentValue for ACTIVE asset', () => {
      setup();
      expect(component.displayCurrentValue()).toBe(10500);
    });

    it('should return redeemedValue for REDEEMED asset', () => {
      setup(mockDetailRedeemed);
      expect(component.displayCurrentValue()).toBe(10800);
    });
  });

  // ─── eligiblePockets ──────────────────────────────────────────────────────

  describe('eligiblePockets', () => {
    beforeEach(() => setup());

    it('should return only BANK_ACCOUNT and CASH pockets', () => {
      const result = component.eligiblePockets();
      expect(result.length).toBe(2);
      expect(result.find(p => p.type === 'BENEFIT_ACCOUNT')).toBeUndefined();
    });
  });

  // ─── Modal helpers ────────────────────────────────────────────────────────

  describe('openModal() / closeModal()', () => {
    beforeEach(() => setup());

    it('should open and close modal', () => {
      component.openModal('edit');
      expect(component.activeModal()).toBe('edit');
      component.closeModal();
      expect(component.activeModal()).toBeNull();
    });

    it('should clear errorMessage on close', () => {
      component.openModal('edit');
      component['errorMessage'].set('erro');
      component.closeModal();
      expect(component.errorMessage()).toBe('');
    });
  });

  // ─── Display helpers ──────────────────────────────────────────────────────

  describe('display helpers', () => {
    beforeEach(() => setup());

    it('statusLabel should map all statuses', () => {
      expect(component.statusLabel('ACTIVE')).toBe('Ativo');
      expect(component.statusLabel('MATURED')).toBe('Vencido');
      expect(component.statusLabel('REDEEMED')).toBe('Resgatado');
    });

    it('categoryLabel should translate RENDA_FIXA and PREVIDENCIA', () => {
      expect(component.categoryLabel('RENDA_FIXA')).toBe('Renda Fixa');
      expect(component.categoryLabel('PREVIDENCIA')).toBe('Previdência');
    });

    it('transactionLabel should map all types', () => {
      expect(component.transactionLabel('BUY')).toBe('Aporte');
      expect(component.transactionLabel('SELL')).toBe('Resgate');
      expect(component.transactionLabel('YIELD')).toBe('Rendimento');
      expect(component.transactionLabel('TAX')).toBe('Imposto');
    });

    it('isCredit should return true only for YIELD', () => {
      expect(component.isCredit('YIELD')).toBe(true);
      expect(component.isCredit('BUY')).toBe(false);
    });

    it('isDebit should return true for SELL and TAX', () => {
      expect(component.isDebit('SELL')).toBe(true);
      expect(component.isDebit('TAX')).toBe(true);
      expect(component.isDebit('BUY')).toBe(false);
    });

    it('categoryNameFor should return pre-defined category names', () => {
      expect(component.categoryNameFor('buy')).toBe('Aporte em Investimento');
      expect(component.categoryNameFor('yield')).toBe('Rendimento de Investimento');
      expect(component.categoryNameFor('sell')).toBe('Resgate de Investimento');
    });
  });

  // ─── onEdit() — sem custodian ─────────────────────────────────────────────

  describe('onEdit() — asset without custodian', () => {
    beforeEach(() => setup());

    it('should initialize editForm with custodianLegalEntityId as null', () => {
      component.openModal('edit');
      expect(component.editForm.get('custodianLegalEntityId')?.value).toBeNull();
    });

    it('should not submit when form is invalid', () => {
      component.openModal('edit');
      component.editForm.patchValue({ name: '' });
      component.onEdit();
      expect(assetServiceSpy.updateAsset).not.toHaveBeenCalled();
    });

    it('should call updateAsset with custodianLegalEntityId undefined when null', () => {
      assetServiceSpy.updateAsset.mockReturnValue(of(mockDetail));
      component.openModal('edit');
      component.editForm.patchValue({ name: 'CDB Atualizado', legalEntityId: 1, custodianLegalEntityId: null });
      component.onEdit();
      expect(assetServiceSpy.updateAsset).toHaveBeenCalledWith(1, {
        name: 'CDB Atualizado',
        legalEntityId: 1,
        custodianLegalEntityId: null,
      });
      expect(component.activeModal()).toBeNull();
    });

    it('should close modal and update asset on success', () => {
      assetServiceSpy.updateAsset.mockReturnValue(of(mockDetail));
      component.openModal('edit');
      component.editForm.patchValue({ name: 'CDB Atualizado', legalEntityId: 1 });
      component.onEdit();
      expect(component.activeModal()).toBeNull();
      expect(component.asset()).toEqual(mockDetail);
    });

    it('should set errorMessage on failure', () => {
      assetServiceSpy.updateAsset.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } })),
      );
      component.openModal('edit');
      component.onEdit();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── onEdit() — com custodian ─────────────────────────────────────────────

  describe('onEdit() — asset with custodian', () => {
    beforeEach(() => setup(mockDetailWithCustodian));

    it('should pre-fill custodianLegalEntityId with existing custodian id', () => {
      component.openModal('edit');
      expect(component.editForm.get('custodianLegalEntityId')?.value).toBe(mockCustodianLegalEntity.id);
    });

    it('should send custodianLegalEntityId as number in payload', () => {
      assetServiceSpy.updateAsset.mockReturnValue(of(mockDetailWithCustodian));
      component.openModal('edit');
      component.editForm.patchValue({ name: 'CDB Atualizado', legalEntityId: 1 });
      component.onEdit();
      expect(assetServiceSpy.updateAsset).toHaveBeenCalledWith(1, {
        name: 'CDB Atualizado',
        legalEntityId: 1,
        custodianLegalEntityId: mockCustodianLegalEntity.id,
      });
    });

    it('should allow clearing the custodian by setting null', () => {
      assetServiceSpy.updateAsset.mockReturnValue(of(mockDetail));
      component.openModal('edit');
      component.editForm.patchValue({
        name: 'CDB Atualizado', legalEntityId: 1, custodianLegalEntityId: null,
      });
      component.onEdit();
      const [, payload] = assetServiceSpy.updateAsset.mock.calls[0];
      expect(payload.custodianLegalEntityId).toBeNull();
    });
  });

  // ─── onUpdatePosition() ───────────────────────────────────────────────────

  describe('onUpdatePosition()', () => {
    beforeEach(() => setup());

    it('should call updatePosition and update asset on success', () => {
      const updated = {
        ...mockDetail,
        position: { ...mockDetail.position, currentValue: 11000, lastValuationDate: '2025-02-01' },
      };
      assetServiceSpy.updatePosition.mockReturnValue(of(updated));
      component.openModal('update-position');
      component.positionForm.patchValue({ currentValue: 11000, lastValuationDate: '2025-02-01' });
      component.onUpdatePosition();
      expect(assetServiceSpy.updatePosition).toHaveBeenCalledWith(1, {
        currentValue: 11000, lastValuationDate: '2025-02-01',
      });
      expect(component.activeModal()).toBeNull();
      expect(component.asset()?.position.currentValue).toBe(11000);
    });

    it('should set errorMessage on failure', () => {
      assetServiceSpy.updatePosition.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } })),
      );
      component.openModal('update-position');
      component.onUpdatePosition();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── onBuy() ──────────────────────────────────────────────────────────────

  describe('onBuy()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openModal('buy');
      component.onBuy();
      expect(assetServiceSpy.buy).not.toHaveBeenCalled();
    });

    it('should call buy with correct payload (categoryId from getRawValue)', () => {
      assetServiceSpy.buy.mockReturnValue(of(mockTxBuy));
      assetServiceSpy.getAsset.mockReturnValue(of(mockDetail));
      assetServiceSpy.getTransactions.mockReturnValue(of([]));
      component.openModal('buy');
      component.buyForm.patchValue({
        amount: 1000, quantity: 1, pocketId: 5, transactionDate: '2025-01-15', notes: '',
      });
      component.onBuy();
      expect(assetServiceSpy.buy).toHaveBeenCalledWith(1, expect.objectContaining({
        amount: 1000, quantity: 1, pocketId: 5,
        transactionDate: '2025-01-15', categoryId: 11,
      }));
      expect(component.activeModal()).toBeNull();
      expect(component.isSaving()).toBe(false);
    });

    it('should set errorMessage on failure', () => {
      assetServiceSpy.buy.mockReturnValue(
        throwError(() => ({ error: { message: 'Saldo insuficiente' } })),
      );
      component.openModal('buy');
      component.buyForm.patchValue({
        amount: 1000, quantity: 1, pocketId: 5, transactionDate: '2025-01-15', notes: '',
      });
      component.onBuy();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── onYield() ────────────────────────────────────────────────────────────

  describe('onYield()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openModal('yield');
      component.onYield();
      expect(assetServiceSpy.recordYield).not.toHaveBeenCalled();
    });

    it('should call recordYield with categoryId from getRawValue', () => {
      assetServiceSpy.recordYield.mockReturnValue(of(mockTxYield));
      assetServiceSpy.getAsset.mockReturnValue(of(mockDetail));
      assetServiceSpy.getTransactions.mockReturnValue(of([]));
      component.openModal('yield');
      component.yieldForm.patchValue({
        amount: 500, pocketId: 5, transactionDate: '2025-01-10', notes: '',
      });
      component.onYield();
      expect(assetServiceSpy.recordYield).toHaveBeenCalledWith(1, expect.objectContaining({
        amount: 500, pocketId: 5, transactionDate: '2025-01-10', categoryId: 12,
      }));
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      assetServiceSpy.recordYield.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } })),
      );
      component.openModal('yield');
      component.yieldForm.patchValue({
        amount: 500, pocketId: 5, transactionDate: '2025-01-10', notes: '',
      });
      component.onYield();
      expect(component.errorMessage()).toBeTruthy();
    });
  });

  // ─── onSell() ─────────────────────────────────────────────────────────────

  describe('onSell()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openModal('sell');
      component.onSell();
      expect(assetServiceSpy.sell).not.toHaveBeenCalled();
    });

    it('should call sell with grossAmount from currentValue, quantity=1, categoryId from getRawValue', () => {
      assetServiceSpy.sell.mockReturnValue(of([mockTxSell, mockTxTax]));
      assetServiceSpy.getAsset.mockReturnValue(of(mockDetail));
      assetServiceSpy.getTransactions.mockReturnValue(of([]));
      component.openModal('sell');
      component.sellForm.patchValue({
        taxAmount: 150, pocketId: 5, transactionDate: '2025-02-01', notes: '',
      });
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledWith(1, expect.objectContaining({
        grossAmount: 10500, taxAmount: 150, quantity: 1,
        pocketId: 5, transactionDate: '2025-02-01', categoryId: 13,
      }));
      expect(component.activeModal()).toBeNull();
    });

    it('should set errorMessage on failure', () => {
      assetServiceSpy.sell.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro' } })),
      );
      component.openModal('sell');
      component.sellForm.patchValue({
        taxAmount: 0, pocketId: 5, transactionDate: '2025-02-01', notes: '',
      });
      component.onSell();
      expect(component.errorMessage()).toBeTruthy();
    });
  });

  // ─── onDelete() ───────────────────────────────────────────────────────────

  describe('onDelete()', () => {
    beforeEach(() => setup());

    it('should call deleteAsset and navigate to /investments on success', () => {
      assetServiceSpy.deleteAsset.mockReturnValue(of(undefined));
      const spy = jest.spyOn(router, 'navigate');
      component.onDelete();
      expect(assetServiceSpy.deleteAsset).toHaveBeenCalledWith(1);
      expect(spy).toHaveBeenCalledWith(['/investments']);
    });

    it('should set errorMessage on failure', () => {
      assetServiceSpy.deleteAsset.mockReturnValue(
        throwError(() => ({ error: { message: 'Ativo com transações' } })),
      );
      component.onDelete();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });
});