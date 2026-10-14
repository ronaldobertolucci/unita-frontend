import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { of, throwError, Subject, TimeoutError } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';

registerLocaleData(localePt, 'pt-BR');

import { InvestmentDetailComponent } from './investment-detail.component';
import { AssetService } from '../../../core/services/asset.service';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { CategoryService } from '../../../core/services/category.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { PocketService } from '../../../core/services/pocket.service';
import { SessionService } from '../../../core/services/session.service';
import { syntheticSession } from '../../../core/testing/session.mock';
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
const mockCategorySell: CategoryDto  = { id: 13, name: 'Resgate de Investimento',    type: 'INCOME', global: true };

const mockPocket: PocketSummaryDto      = { id: 5, type: 'BANK_ACCOUNT',   label: 'Banco X – Corrente', active: true, balance: 1000 };
const mockPocketCash: PocketSummaryDto  = { id: 6, type: 'CASH',           label: 'Carteira',           active: true, balance: 200  };
const mockPocketBenefit: PocketSummaryDto = { id: 7, type: 'BENEFIT_ACCOUNT', label: 'VA Empresa',       active: true, balance: 500  };

const mockLegalEntity: LegalEntityDto = {
  id: 1, cnpj: '12345678000190', corporateName: 'Banco X', tradeName: null, stateRegistration: null,
};

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildAssetService(detail: AssetDetailDto = mockDetail, txs: InvestmentTransactionDto[] = []) {
  return {
    loadAssets:     jest.fn(),
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
    getBalance:   jest.fn().mockReturnValue(of(1000)),
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
        { provide: TransactionService, useValue: { loadTransactions: jest.fn().mockReturnValue(of([])), getTransactions: jest.fn().mockReturnValue(of([])) } },
        { provide: PocketService,      useValue: pocketServiceSpy      },
        { provide: LegalEntityService, useValue: legalEntityServiceSpy },
        // ─── MOCK CORRIGIDO AQUI ───
        { 
          provide: ActivatedRoute, 
          useValue: { 
            snapshot: { 
              paramMap: { get: () => '1' },
              queryParamMap: { get: () => null } // Simula a ausência do 'custodian' por padrão
            } 
          } 
        },
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
      
      // ─── ASSERT CORRIGIDO AQUI ───
      expect(spy).toHaveBeenCalledWith(['/investments'], { queryParams: { custodian: null } });
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
      expect(component.transactionLabel('YIELD')).toBe('Rendimento resgatado');
      expect(component.transactionLabel('TAX')).toBe('Imposto');
    });

    it('isCredit should return true only for BUY', () => {
      expect(component.isCredit('BUY')).toBe(true);
    });

    it('isDebit should return true for SELL, TAX and YIELD', () => {
      expect(component.isDebit('SELL')).toBe(true);
      expect(component.isDebit('TAX')).toBe(true);
      expect(component.isDebit('YIELD')).toBe(true);
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
      component.editForm.patchValue({ name: 'CDB Atualizado', legalEntityId: 1, custodianLegalEntityId: null, liquidityType: 'DIARIA', });
      component.onEdit();
      expect(assetServiceSpy.updateAsset).toHaveBeenCalledWith(1, {
        name: 'CDB Atualizado',
        legalEntityId: 1,
        custodianLegalEntityId: null,
        liquidityType: 'DIARIA',
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
      component.editForm.patchValue({ name: 'CDB Atualizado', legalEntityId: 1, liquidityType: 'DIARIA' });
      component.onEdit();
      expect(assetServiceSpy.updateAsset).toHaveBeenCalledWith(1, {
        name: 'CDB Atualizado',
        legalEntityId: 1,
        custodianLegalEntityId: mockCustodianLegalEntity.id,
        liquidityType: 'DIARIA',
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

  describe.each(['buy', 'yield'] as const)('reconciliation of %s writes', kind => {
    beforeEach(() => setup());
    const submit = () => kind === 'buy' ? component.onBuy() : component.onYield();
    const request = () => kind === 'buy' ? assetServiceSpy.buy : assetServiceSpy.recordYield;
    const fillForm = () => {
      component.openModal(kind);
      const form = kind === 'buy' ? component.buyForm : component.yieldForm;
      form.patchValue({ amount: 80, quantity: 1, pocketId: 5, transactionDate: '2026-10-14', notes: 'Teste' });
      return form;
    };

    it.each([0, 408, 500, 'timeout'])('blocks re-submission after %s until all reads and explicit confirmation', status => {
      const form = fillForm();
      const history = new Subject<InvestmentTransactionDto[]>();
      assetServiceSpy.getTransactions.mockReturnValue(history);
      const updated = { ...mockDetail, position: { ...mockDetail.position, currentValue: 10420 } };
      assetServiceSpy.getAsset.mockReturnValue(of(updated));
      request().mockReturnValue(throwError(() => status === 'timeout' ? new TimeoutError() : { status }));
      submit(); fixture.detectChanges();
      expect(component.isSaving()).toBe(false); expect(form.value.amount).toBe(80);
      expect(component.financialRecovery.state()).toBe('checking');
      expect(fixture.nativeElement.querySelector('.modal button[type="submit"]').disabled).toBe(true);
      submit(); component.financialRecovery.confirm();
      expect(request()).toHaveBeenCalledTimes(1); expect(component.financialRecovery.state()).toBe('checking');
      history.next([{ ...mockTxBuy, pocketTransactionId: 101 }]); history.complete(); fixture.detectChanges();
      expect(component.financialRecovery.state()).toBe('review');
      expect(component.asset()?.position.currentValue).toBe(10420);
      expect(fixture.nativeElement.querySelector('.modal .review-notice').textContent).toContain('Lançamento #101');
      expect(TestBed.inject(TransactionService).getTransactions).toHaveBeenCalledWith(5);
      expect(pocketServiceSpy.getBalance).toHaveBeenCalledWith(5);
      submit(); expect(request()).toHaveBeenCalledTimes(1);
      component.financialRecovery.confirm(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.modal button[type="submit"]').disabled).toBe(false);
      expect(request()).toHaveBeenCalledTimes(1);
      request().mockReturnValue(of(mockTxBuy));
      submit(); expect(request()).toHaveBeenCalledTimes(2);
    });

    it('preserves the block after a failed consultation and closing/reopening the page', () => {
      fillForm();
      request().mockReturnValue(throwError(() => ({ status: 0 })));
      assetServiceSpy.getTransactions.mockReturnValue(throwError(() => ({ status: 500 })));
      submit(); component.financialRecovery.confirm();
      expect(component.financialRecovery.state()).toBe('pending');
      component.closeModal(); component.openModal(kind);
      expect(component.activeModal()).toBeNull();
      fixture.destroy();
      fixture = TestBed.createComponent(InvestmentDetailComponent);
      component = fixture.componentInstance; fixture.detectChanges();
      component.openModal(kind);
      expect(component.financialRecovery.state()).toBe('pending'); expect(component.activeModal()).toBeNull();
      expect(fixture.nativeElement.querySelector('.review-notice')).not.toBeNull();
      expect(request()).toHaveBeenCalledTimes(1);
    });

    it('rejects concurrent submission and reconciles a response cancelled by navigation', () => {
      fillForm(); const pending = new Subject<InvestmentTransactionDto>();
      request().mockReturnValue(pending);
      submit(); submit(); fixture.detectChanges();
      expect(request()).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.modal button[type="submit"]').disabled).toBe(true);
      fixture.destroy();
      expect(component.financialRecovery.state()).toBe('review');
      expect(assetServiceSpy.getAsset).toHaveBeenCalledTimes(2);
      expect(TestBed.inject(TransactionService).getTransactions).toHaveBeenCalledWith(5);
    });

    it('preserves an interrupted write through expiry and same-user renewal', () => {
      const session = TestBed.inject(SessionService);
      session.accept(syntheticSession(), session.version());
      fillForm(); request().mockReturnValue(new Subject<InvestmentTransactionDto>());
      submit(); session.invalidate('expired'); fixture.destroy();
      expect(component.financialRecovery.state()).toBe('pending');
      session.accept(syntheticSession(), session.version());
      component.financialRecovery.check();
      expect(component.financialRecovery.state()).toBe('review');
      expect(request()).toHaveBeenCalledTimes(1);
    });

    it('permits correction after a definite validation rejection', () => {
      fillForm(); request().mockReturnValue(throwError(() => ({ status: 400, error: { error: 'Validation Failed' } })));
      submit(); expect(component.financialRecovery.state()).toBe('clear');
      expect(assetServiceSpy.getAsset).toHaveBeenCalledTimes(1);
      request().mockReturnValue(of(mockTxBuy)); submit(); expect(request()).toHaveBeenCalledTimes(2);
    });
  });

  describe('onSell()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openModal('sell');
      component.onSell();
      expect(assetServiceSpy.sell).not.toHaveBeenCalled();
    });

    function fillSell(grossAmount: unknown = 100, taxAmount: unknown = 10): void {
      component.openModal('sell');
      component.sellForm.patchValue({ grossAmount, taxAmount, pocketId: 5, categoryId: 13 });
    }

    it.each([
      [null, 0], ['', 0], [0, 0], [-1, 0], [100, null], [100, ''], [100, -50], [100, 150],
      [Infinity, 0], [100, NaN],
    ])('rejects gross %s / tax %s without writing', (gross, tax) => {
      fillSell(gross, tax);
      component.onSell();
      expect(component.sellForm.invalid).toBe(true);
      expect(assetServiceSpy.sell).not.toHaveBeenCalled();
    });

    it.each([[0, 100], [10, 90], [100, 0]])('accepts tax %s and previews net %s', (tax, net) => {
      fillSell(100, tax);
      expect(component.sellNetAmount()).toBe(net);
      assetServiceSpy.sell.mockReturnValue(of([mockTxSell, mockTxTax]));
      assetServiceSpy.getAsset.mockReturnValue(of(mockDetailRedeemed));
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
      expect(assetServiceSpy.sell.mock.calls[0][1]).not.toHaveProperty('quantity');
      expect(component.asset()?.status).toBe('REDEEMED');
      expect(pocketServiceSpy.getBalance).toHaveBeenCalledWith(5);
      expect(TestBed.inject(TransactionService).loadTransactions).toHaveBeenCalledWith(5);
      component.openModal('sell');
      expect(component.activeModal()).toBeNull();
    });

    it('renders an editable gross amount, integral redemption and zero net preview', () => {
      fillSell(100, 100);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect((element.querySelector('[formControlName="grossAmount"]') as HTMLInputElement).disabled).toBe(false);
      expect(element.textContent).toContain('Registrar resgate integral');
      expect(element.textContent).toContain('Líquido previsto:');
      expect(element.textContent).toMatch(/R\$\s*0,00/);
      const categories = element.querySelector('[formControlName="categoryId"]') as HTMLSelectElement;
      expect(Array.from(categories.options).map(option => option.value)).toEqual(['', '12', '13']);
    });

    it('uses decimal subtraction for the preview and permits small positive gross amounts', () => {
      fillSell(0.3, 0.1);
      expect(component.sellNetAmount()).toBe(0.2);
      fillSell(0.001, 0);
      expect(component.sellForm.valid).toBe(true);
    });

    it('rejects an expense category even if supplied programmatically', () => {
      fillSell();
      component.sellForm.patchValue({ categoryId: 11 });
      component.onSell();
      expect(assetServiceSpy.sell).not.toHaveBeenCalled();
    });

    it('prevents a second submit and closing while saving', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(new Subject());
      component.onSell();
      component.onSell();
      component.closeModal();
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
      expect(component.activeModal()).toBe('sell');
    });

    it('marks API field errors and permits correction', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 400, error: {
        errors: [{ field: 'taxAmount', message: 'must be greater than or equal to 0' }],
      } })));
      component.onSell();
      expect(component.sellForm.get('taxAmount')?.getError('server')).toBeTruthy();
      component.sellForm.patchValue({ taxAmount: 0 });
      expect(component.sellForm.valid).toBe(true);
      expect(component.sellNeedsReview()).toBe(false);
    });

    it('handles the service relation error without an errors array', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 400, error: {
        message: 'taxAmount must not exceed grossAmount', errors: null,
      } })));
      component.onSell();
      expect(component.sellForm.hasError('taxExceedsGross')).toBe(true);
      expect(component.errorMessage()).toContain('imposto');
    });

    it.each([0, 500])('consults an uncertain result after HTTP %s without repeating the write', status => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status })));
      component.onSell();
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
      expect(component.sellNeedsReview()).toBe(true);
      expect(component.sellReviewLoaded()).toBe(true);
      expect(pocketServiceSpy.getBalance).toHaveBeenCalledWith(5);
      expect(TestBed.inject(TransactionService).loadTransactions).toHaveBeenCalledWith(5);
      component.allowSellRetry();
      expect(component.sellNeedsReview()).toBe(false);
    });

    it('keeps retry blocked when a result consultation fails', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 0 })));
      pocketServiceSpy.getBalance.mockReturnValue(throwError(() => ({ status: 500 })));
      component.onSell();
      component.allowSellRetry();
      component.onSell();
      expect(component.sellReviewLoaded()).toBe(false);
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
    });

    it('allows correcting an unavailable account after refreshing selectors on 404', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 404 })));
      pocketServiceSpy.getBalance.mockReturnValue(throwError(() => ({ status: 404 })));
      component.onSell();
      expect(component.sellRefreshing()).toBe(false);
      expect(component.sellNeedsReview()).toBe(false);
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalledTimes(2);
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalledTimes(2);
    });

    it.each([404, 409])('refreshes state after HTTP %s', status => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status })));
      assetServiceSpy.getAsset.mockReturnValue(of(mockDetailRedeemed));
      component.onSell();
      expect(component.asset()?.status).toBe('REDEEMED');
      expect(component.activeModal()).toBeNull();
      expect(categoryServiceSpy.loadCategories).toHaveBeenCalledTimes(2);
    });

    it('should call sell with grossAmount from currentValue and selected categoryId', () => {
      assetServiceSpy.sell.mockReturnValue(of([mockTxSell, mockTxTax]));
      assetServiceSpy.getAsset.mockReturnValue(of(mockDetail));
      assetServiceSpy.getTransactions.mockReturnValue(of([]));
      component.openModal('sell');
      component.sellForm.patchValue({
        taxAmount: 150, pocketId: 5, transactionDate: '2025-02-01', notes: '',
      });
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledWith(1, expect.objectContaining({
        grossAmount: 10500, taxAmount: 150,
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

      // ─── ASSERT CORRIGIDO AQUI ───
      expect(spy).toHaveBeenCalledWith(['/investments'], { queryParams: { custodian: null } });
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
