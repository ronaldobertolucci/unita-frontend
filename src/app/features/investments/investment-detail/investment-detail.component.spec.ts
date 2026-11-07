import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { of, throwError, Subject, TimeoutError } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';

const saleUuid = 'f627f953-ffbd-4e4b-92c3-333ce72f22d5';
const originalRandomUuid = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
beforeAll(() => Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => saleUuid }));
afterAll(() => {
  if (originalRandomUuid) Object.defineProperty(crypto, 'randomUUID', originalRandomUuid);
  else Reflect.deleteProperty(crypto, 'randomUUID');
});

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
import { investmentBaseline } from '../../../core/testing/investment-baseline.fixture';

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
    quantity: 1, averagePrice: 10000, remainingCost: 10000, totalInvested: 10000,
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
  position: { ...mockDetail.position, quantity: 0, remainingCost: 0, averagePrice: 0, currentValue: 0, redeemedValue: 10800 },
};

const mockTxBuy: InvestmentTransactionDto = {
  id: 10, type: 'BUY', quantity: null, costBasis: null, relatedSellId: null, operationId: null, amount: 10000, transactionDate: '2024-01-15', notes: null,
};

const mockTxYield: InvestmentTransactionDto = {
  id: 11, type: 'YIELD', quantity: null, costBasis: null, relatedSellId: null, operationId: null, amount: 500, transactionDate: '2025-01-10', notes: 'Rendimento mensal',
};

const mockTxSell: InvestmentTransactionDto = {
  id: 12, type: 'SELL', quantity: null, costBasis: null, relatedSellId: null, operationId: null, amount: 10500, transactionDate: '2025-02-01', notes: null,
};

const mockTxTax: InvestmentTransactionDto = {
  id: 13, type: 'TAX', quantity: null, costBasis: null, relatedSellId: null, operationId: null, amount: 150, transactionDate: '2025-02-01', notes: null,
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
    refreshAssets: jest.fn().mockReturnValue(of([])),
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

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

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

    const session = TestBed.inject(SessionService);
    session.accept(syntheticSession(), session.version());
    fixture   = TestBed.createComponent(InvestmentDetailComponent);
    component = fixture.componentInstance;
    router    = TestBed.inject(Router);
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('INV-001 readable legacy baseline', () => {
    it.each(['fixedIncome', 'pension', 'redeemed'] as const)('renders %s and preserves its original position', kind => {
      const data = investmentBaseline();
      const transactions = kind === 'fixedIncome' ? data.transactions
        : kind === 'pension' ? data.pensionTransactions : data.redemptionTransactions;
      setup(data[kind], transactions);
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.asset-title')?.textContent).toContain(data[kind].name);
      expect(component.asset()?.position).toEqual(data[kind].position);
      expect(element.querySelectorAll('.tx-item')).toHaveLength(transactions.length);
      for (const movement of transactions) {
        if (movement.notes !== null) expect(element.textContent).toContain(movement.notes);
      }
      expect(component.transactions()).toEqual([...transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)));
      if (kind === 'pension') {
        expect(element.querySelector('.detail-chips')?.textContent).toContain('VGBL');
        expect(element.querySelector('.detail-chips')?.textContent).toContain('Regressivo');
      }
      if (kind === 'redeemed') expect(element.querySelector('.btn-tx--sell')).toBeNull();
    });

    it('preserves the same command when legacy history cannot identify the uncertain sale', () => {
      const data = investmentBaseline();
      setup({ ...data.redeemed, status: 'ACTIVE', position: { ...data.redeemed.position, quantity: 1, remainingCost: 1000, averagePrice: 1000, currentValue: 1100 } });
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 0 })));
      assetServiceSpy.getAsset.mockReturnValue(of(data.redeemed));
      assetServiceSpy.getTransactions.mockReturnValue(of(data.redemptionTransactions));
      pocketServiceSpy.getBalance.mockReturnValue(of(1085));
      component.openModal('sell');
      component.sellForm.patchValue({ grossAmount: 1100, taxAmount: 15, pocketId: 5,
        categoryId: 13, transactionDate: '2026-10-12', notes: 'S01 gross 1100; net cash 1085' });
      component.onSell();
      component.allowSellRetry();
      component.onSell();
      fixture.detectChanges();
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(2);
      expect(assetServiceSpy.sell.mock.calls[1]).toEqual(assetServiceSpy.sell.mock.calls[0]);
      expect(component.asset()).toEqual(data.redeemed);
      expect(component.transactions()).toHaveLength(3);
      expect(component.sellBalance()).toBe(1085);
      expect((fixture.nativeElement as HTMLElement).querySelector('.btn-tx--sell')).toBeNull();
    });
  });

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

  describe('position and mixed investment history', () => {
    it('shows the partial-sale example as 240 result and 8 percent with distinct balances', () => {
      setup({ ...mockDetail, position: { ...mockDetail.position, quantity: 2, averagePrice: 1000,
        remainingCost: 2000, totalInvested: 3000, currentValue: 2200, redeemedValue: 1040 } });
      expect(component.accumulatedResult()).toBe(240); expect(component.variation()).toBe(8);
      const text = fixture.nativeElement.textContent;
      for (const label of ['Quantidade restante', 'Custo restante', 'Preço médio', 'Total de aportes', 'Recebido acumulado', 'Resultado acumulado simples']) expect(text).toContain(label);
      expect(text).toMatch(/240,00/); expect(text).toContain('8,00%');
      expect(text).toContain('Não representa lucro realizado');
    });

    it('keeps zero remaining value and cumulative receipts visible after final sale', () => {
      setup(mockDetailRedeemed);
      const rows = Array.from(fixture.nativeElement.querySelectorAll('.position-item')) as HTMLElement[];
      expect(rows.find(row => row.textContent?.includes('Avaliação restante'))?.textContent).toMatch(/0,00/);
      expect(rows.find(row => row.textContent?.includes('Recebido acumulado'))?.textContent).toMatch(/10\.800,00/);
      expect(rows.find(row => row.textContent?.includes('Custo restante'))?.textContent).toMatch(/0,00/);
    });

    it('shows known fractional units, zero cost and explicit tax linkage without inferring legacy data', () => {
      setup(mockDetail, [mockTxBuy, { ...mockTxSell, quantity: 0.00000001, costBasis: 0 },
        { ...mockTxTax, relatedSellId: mockTxSell.id }, { ...mockTxTax, id: 14 }]);
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('#investment-tx-10')?.textContent).toContain('Não disponível no histórico');
      expect(element.querySelector('#investment-tx-12')?.textContent).toContain('0,00000001');
      expect(element.querySelector('#investment-tx-12')?.textContent).toMatch(/Custo baixado:[\s\S]*0,00/);
      expect(element.querySelector('#investment-tx-13')?.textContent).toContain('Imposto da venda #12');
      expect(element.querySelector('#investment-tx-14')?.textContent).toContain('Venda vinculada: Não disponível no histórico');
      expect(element.querySelector('#investment-tx-14')?.textContent).not.toContain('Imposto da venda #12');
    });

    it('shows no percentage base when contributions are zero', () => {
      setup({ ...mockDetail, position: { ...mockDetail.position, totalInvested: 0 } });
      expect(fixture.nativeElement.textContent).toContain('Sem base de cálculo');
      expect(fixture.nativeElement.querySelector('.position-variation')).toBeNull();
    });
  });

  describe('variation()', () => {
    it('should calculate based on currentValue for ACTIVE asset', () => {
      setup();
      expect(component.variation()).toBeCloseTo(5, 0);
    });

    it('should calculate based on redeemedValue for REDEEMED asset', () => {
      setup(mockDetailRedeemed);
      expect(component.variation()).toBeCloseTo(8, 0);
    });

    it('should show no calculation base when totalInvested is 0', () => {
      setup({ ...mockDetail, position: { ...mockDetail.position, totalInvested: 0 } });
      expect(component.variation()).toBeNull();
    });
  });

  describe('displayCurrentValue', () => {
    it('should return currentValue for ACTIVE asset', () => {
      setup();
      expect(component.displayCurrentValue()).toBe(10500);
    });

    it('should show zero remaining valuation for REDEEMED asset', () => {
      setup(mockDetailRedeemed);
      expect(component.displayCurrentValue()).toBe(0);
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

    it.each(['FII', 'DESCONHECIDA', '', 'constructor'])('uses an explicit fallback for category %s', category => {
      expect(component.categoryLabel(category)).toBe('Categoria não reconhecida');
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

    it('shows a translated error when updating a position without units', () => {
      assetServiceSpy.updatePosition.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: 'Cannot value a position without units' } })),
      );
      component.openModal('update-position');
      component.positionForm.patchValue({ currentValue: 100, lastValuationDate: '2025-02-01' });
      component.onUpdatePosition();
      fixture.detectChanges();
      expect(assetServiceSpy.updatePosition).toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain(
        'Não é possível atualizar a posição de um investimento sem quantidade disponível. Registre um aporte antes de continuar.'
      );
      expect(fixture.nativeElement.textContent).not.toContain('Cannot value a position without units');
      expect(component.activeModal()).toBe('update-position');
      expect(component.isSaving()).toBe(false);
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

  it('renders an unknown category explicitly in the investment detail', () => {
    setup({ ...mockDetail, category: 'DESCONHECIDA' as AssetDetailDto['category'], fixedIncomeDetails: null });
    const badge = fixture.nativeElement.querySelector('.badge-category');
    expect(badge?.textContent).toContain('Categoria não reconhecida');
    expect(badge?.textContent).not.toContain('Previdência');
  });

  describe('onBuy()', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openModal('buy');
      component.onBuy();
      expect(assetServiceSpy.buy).not.toHaveBeenCalled();
    });

    it.each([0, -1, -0.00000001, NaN, Infinity, -Infinity, '', null])('rejects quantity %s before any write', quantity => {
      component.openModal('buy');
      component.buyForm.patchValue({ amount: 1000, quantity, pocketId: 5, transactionDate: '2025-01-15' });
      component.onBuy();
      expect(component.buyForm.get('quantity')?.invalid).toBe(true);
      expect(component.buyForm.get('quantity')?.touched).toBe(true);
      expect(assetServiceSpy.buy).not.toHaveBeenCalled();
      expect(component.financialRecovery.state()).toBe('clear');
      expect(component.asset()).toEqual(mockDetail);
      expect(component.isSaving()).toBe(false);
    });

    it('shows the existing error style and associates the positive quantity error with its input', () => {
      component.openModal('buy');
      component.buyForm.patchValue({ amount: 1000, pocketId: 5, transactionDate: '2025-01-15' });
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const input = element.querySelector<HTMLInputElement>('#buy-quantity')!;
      input.value = '0';
      input.dispatchEvent(new Event('input'));
      element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('buy-quantity-error');
      expect(input.closest('.field')?.classList.contains('field--invalid')).toBe(true);
      expect(element.querySelector('#buy-quantity-error')?.textContent).toContain('maior que zero');
      expect(assetServiceSpy.buy).not.toHaveBeenCalled();
    });

    it.each(['0.00000001', '0.125', '2'])('submits a positive quantity %s without rounding or multiplying the unit price', quantity => {
      assetServiceSpy.buy.mockReturnValue(of(mockTxBuy));
      component.openModal('buy');
      component.buyForm.patchValue({ amount: 100.12, pocketId: 5, transactionDate: '2025-01-15' });
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const input = element.querySelector<HTMLInputElement>('#buy-quantity')!;
      input.value = quantity;
      input.dispatchEvent(new Event('input'));
      expect(input.validity.stepMismatch).toBe(false);
      element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(assetServiceSpy.buy).toHaveBeenCalledWith(1, expect.objectContaining({
        amount: 100.12, quantity: Number(quantity), pocketId: 5, categoryId: 11,
      }));
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

  describe('yield meaning and category capabilities', () => {
    it('explains receipts without showing a sale message or button in the yield form', () => {
      setup(); component.openModal('yield'); fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.btn-tx--yield')?.textContent).toContain('Receber rendimento');
      expect(element.textContent).toContain('não reduz unidades nem custo');
      expect(element.textContent).toContain('incluído na avaliação atual');
      expect(element.textContent).not.toContain('Resgate parcial');
      expect(element.textContent).not.toContain('resgate parcial antecipado');
      expect(element.querySelector('.modal')?.textContent).not.toContain('Vender/resgatar');
      expect(element.querySelector('.modal')?.textContent).not.toContain('Para retirar dinheiro vendendo unidades');
      expect(component.activeModal()).toBe('yield');
      expect(assetServiceSpy.recordYield).not.toHaveBeenCalled();
    });

    it.each([0, -1, 10500.00000001, Infinity, NaN, 0.000000001])('rejects receipt %s outside supported positive valuation balance', amount => {
      setup(); component.openModal('yield');
      component.yieldForm.patchValue({ amount, pocketId: 5 }); component.onYield();
      expect(component.yieldForm.controls['amount'].invalid).toBe(true);
      expect(assetServiceSpy.recordYield).not.toHaveBeenCalled();
    });

    it.each(['RENDA_FIXA', 'PREVIDENCIA'] as const)('refreshes a receipt for %s while preserving authoritative units and cost', category => {
      const data = { ...mockDetail, category };
      setup(data); component.openModal('yield');
      const updated = { ...data, position: { ...data.position, currentValue: 10000, redeemedValue: 500 } };
      assetServiceSpy.recordYield.mockReturnValue(of(mockTxYield));
      assetServiceSpy.getAsset.mockReturnValue(of(updated));
      component.yieldForm.patchValue({ amount: 500, pocketId: 5 }); component.onYield();
      expect(assetServiceSpy.recordYield).toHaveBeenCalledWith(1, expect.objectContaining({ amount: 500 }));
      expect(component.asset()?.position.quantity).toBe(data.position.quantity);
      expect(component.asset()?.position.remainingCost).toBe(data.position.remainingCost);
      expect(component.asset()?.position.currentValue).toBe(10000);
      expect(component.asset()?.position.redeemedValue).toBe(500);
    });

    it('renders unknown categories without inheriting details, icons or operations', () => {
      setup({ ...mockDetail, category: 'FUNDOS' as AssetDetailDto['category'] });
      const element: HTMLElement = fixture.nativeElement;
      expect(element.textContent).toContain('Categoria não reconhecida');
      expect(element.querySelector('.detail-chips')).toBeNull();
      expect(element.querySelector('.asset-header-icon svg')).toBeNull();
      expect(element.querySelector('.action-row')).toBeNull();
      for (const action of ['buy', 'yield', 'sell', 'update-position'] as const) component.openModal(action);
      component.onBuy(); component.onYield(); component.onSell(); component.onUpdatePosition();
      expect(component.activeModal()).toBeNull(); expect(component.canSell()).toBe(false);
      expect(assetServiceSpy.buy).not.toHaveBeenCalled(); expect(assetServiceSpy.recordYield).not.toHaveBeenCalled();
    });
  });

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

  describe('partial sales', () => {
    beforeEach(() => setup({ ...mockDetail, position: { ...mockDetail.position,
      quantity: 3, remainingCost: 3000, totalInvested: 3000, currentValue: 3300 } }));

    function open(): void {
      component.openModal('sell');
      component.sellForm.patchValue({ taxAmount: 10, pocketId: 5, categoryId: 13 });
      fixture.detectChanges();
    }

    it('renders minimum fractional units in position and sale preview while keeping currency at two decimals', () => {
      component.asset.set({ ...component.asset()!, position: { ...component.asset()!.position,
        quantity: 0.00000002, currentValue: 20, remainingCost: 20 } });
      open();
      component.sellForm.patchValue({ quantity: '0.00000001', grossAmount: 10.25, taxAmount: 0.25 });
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const rows = Array.from(element.querySelectorAll('.position-item'));
      expect(rows.find(row => row.textContent?.includes('Quantidade restante'))?.textContent).toContain('0,00000002');
      expect(element.textContent).toContain('Saldo previsto: 0,00000001');
      expect(element.textContent).toMatch(/Líquido previsto:\s*R\$\s*10,00/);
      expect(element.querySelector('.sell-final-warning')).toBeNull();
      expect(component.sellForm.valid).toBe(true);
    });

    it('shows 1 of 3 as 2 remaining, accessible input and no final-sale warning', () => {
      open();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#sell-quantity');
      input.value = '1'; input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.sellRemainingQuantity()).toBe('2');
      expect(component.sellForm.value.grossAmount).toBe(1100);
      expect(input.labels?.[0].textContent).toContain('Quantidade a vender');
      expect(input.getAttribute('aria-describedby')).toContain('sell-quantity-error');
      expect(fixture.nativeElement.textContent).toContain('Saldo previsto: 2');
      expect(fixture.nativeElement.querySelector('.sell-final-warning')).toBeNull();
      const sellAll: HTMLButtonElement = input.parentElement!.querySelector('button[aria-label="Vender tudo"]')!;
      expect(sellAll.title).toBe('Vender tudo');
      expect(sellAll.querySelector('svg')).not.toBeNull();
      sellAll.click();
      fixture.detectChanges();
      expect(component.sellForm.value.quantity).toBe('3');
      expect(component.sellRemainingQuantity()).toBe('0');
      expect(fixture.nativeElement.querySelector('#sell-balance')?.textContent).toContain('Saldo previsto: 0');
      expect(fixture.nativeElement.textContent).not.toContain('A venda de todas as unidades encerrará o investimento');
    });

    it('shows an insufficient balance error immediately when the entered quantity exceeds availability', () => {
      open();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#sell-quantity');
      input.value = '4';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const balance: HTMLElement = fixture.nativeElement.querySelector('#sell-balance');
      expect(balance.textContent).toContain('Saldo insuficiente.');
      expect(balance.classList.contains('sell-balance--error')).toBe(true);
      expect(balance.textContent).not.toContain('Saldo previsto:');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      input.value = '2';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(balance.classList.contains('sell-balance--error')).toBe(false);
      expect(balance.textContent).toContain('Saldo previsto: 1');
      expect(input.getAttribute('aria-invalid')).toBe('false');
    });

    it.each(['', '0', '-1', '4', '0.000000001', 'Infinity', 'NaN', 'abc', '9999999999.999999999'])
      ('rejects invalid or unavailable quantity %s before sending', quantity => {
        open(); component.sellForm.patchValue({ quantity }); component.onSell(); fixture.detectChanges();
        expect(component.sellForm.controls['quantity'].invalid).toBe(true);
        expect(assetServiceSpy.sell).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('#sell-quantity').getAttribute('aria-invalid')).toBe('true');
        if (quantity === '4') {
          expect(fixture.nativeElement.querySelector('#sell-balance').textContent).toContain('Saldo insuficiente');
        } else {
          expect(fixture.nativeElement.querySelector('#sell-quantity-error').textContent).toContain('quantidade positiva');
        }
      });

    it('preserves manually negotiated gross until explicitly reapplying suggestion', () => {
      open();
      component.sellForm.patchValue({ quantity: '1' });
      component.sellForm.patchValue({ grossAmount: 900, taxAmount: 0 });
      component.sellForm.patchValue({ quantity: '2', notes: 'Deságio' });
      expect(component.sellForm.value.grossAmount).toBe(900);
      component.applySellSuggestion();
      expect(component.sellForm.value.grossAmount).toBe(2200);
      component.sellForm.patchValue({ quantity: '1' });
      expect(component.sellForm.value.grossAmount).toBe(1100);
    });

    it.each(['ACTIVE', 'MATURED'] as const)('sells a partial position in %s and leaves a new sale available after refresh', status => {
      component.asset.set({ ...component.asset()!, status });
      open(); component.sellForm.patchValue({ quantity: '1', grossAmount: 4000, taxAmount: 4000 });
      expect(component.sellNetAmount()).toBe(0);
      const remaining = { ...component.asset()!, position: { ...component.asset()!.position,
        quantity: 2, remainingCost: 2000, currentValue: 2200 } };
      assetServiceSpy.sell.mockReturnValue(of([mockTxSell, mockTxTax]));
      assetServiceSpy.getAsset.mockReturnValue(of(remaining));
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledWith(1, expect.objectContaining({ quantity: 1, grossAmount: 4000, taxAmount: 4000 }));
      expect(component.asset()).toEqual(remaining);
      expect(component.canSell()).toBe(true);
      expect(component.sellNeedsReview()).toBe(false);
      component.openModal('sell');
      expect(component.activeModal()).toBe('sell');
      expect(component.sellForm.value.quantity).toBe('2');
    });

    it('uses decimal fractions without binary subtraction to decide closure', () => {
      component.asset.set({ ...component.asset()!, position: { ...component.asset()!.position, quantity: 0.3 } });
      open(); component.sellForm.patchValue({ quantity: '0,2' });
      expect(component.sellRemainingQuantity()).toBe('0.1');
      component.sellAll(); expect(component.sellRemainingQuantity()).toBe('0');
      component.sellForm.patchValue({ quantity: '0.00000001', taxAmount: 0 });
      assetServiceSpy.sell.mockReturnValue(of([mockTxSell, mockTxTax]));
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledWith(1, expect.objectContaining({ quantity: 0.00000001 }));
    });

    it('refreshes a conflict and requires review without resending or overwriting negotiated gross', () => {
      open(); component.sellForm.patchValue({ quantity: '2', grossAmount: 2000 });
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 409 })));
      assetServiceSpy.getAsset.mockReturnValue(of({ ...component.asset()!, position: { ...component.asset()!.position, quantity: 1 } }));
      component.onSell();
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
      expect(component.sellNeedsReview()).toBe(true);
      expect(component.sellForm.controls['quantity'].hasError('available')).toBe(true);
      expect(component.sellForm.value.grossAmount).toBe(2000);
      component.onSell(); expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
      component.allowSellRetry();
      component.onSell(); expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
    });

    it('does not open a sale for a position without units or already redeemed', () => {
      component.asset.set({ ...component.asset()!, position: { ...component.asset()!.position, quantity: 0 } });
      component.openModal('sell'); expect(component.activeModal()).toBeNull();
      component.asset.set({ ...mockDetail, status: 'REDEEMED' });
      component.openModal('sell'); expect(component.activeModal()).toBeNull();
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
      expect(assetServiceSpy.sell.mock.calls[0][1]).toHaveProperty('quantity', mockDetail.position.quantity);
      expect(assetServiceSpy.sell.mock.calls[0][1]).toHaveProperty('operationId', saleUuid);
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
      expect(element.textContent).toContain('Vender/resgatar');
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

    it('renders a pending sale without closing or changing the authoritative position', () => {
      fillSell();
      const response = new Subject<InvestmentTransactionDto[]>();
      assetServiceSpy.sell.mockReturnValue(response);
      const original = component.asset();
      component.onSell(); fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
      expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
      expect(element.textContent).toContain('Salvando...');
      expect(component.asset()).toBe(original);
      expect(component.activeModal()).toBe('sell');
      response.error({ status: 400, error: { message: 'Invalid sale request' } });
      fixture.detectChanges();
      expect(element.textContent).not.toContain('Salvando...');
      expect(element.querySelector('.modal-error')?.textContent?.trim()).toBeTruthy();
      expect(component.asset()).toBe(original);
    });

    it.each(['quantity', 'operationId'])('keeps a contract rejection for %s visibly unsuccessful without a fallback sale', field => {
      fillSell();
      const original = component.asset();
      const previousReads = assetServiceSpy.getAsset.mock.calls.length;
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 400, error: {
        errors: [{ field, message: 'must not be null' }],
      } })));
      component.onSell(); fixture.detectChanges();
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(1);
      expect(assetServiceSpy.sell.mock.calls[0][1]).toEqual(expect.objectContaining({
        quantity: mockDetail.position.quantity, operationId: saleUuid,
      }));
      expect(component.asset()).toBe(original);
      expect(component.activeModal()).toBe('sell');
      expect(component.isSaving()).toBe(false);
      expect(component.sellNeedsReview()).toBe(false);
      expect(assetServiceSpy.getAsset).toHaveBeenCalledTimes(previousReads);
      expect(fixture.nativeElement.querySelector('.modal-error')?.textContent).toContain('Revise os campos');
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
      expect(component.sellNeedsReview()).toBe(true);
      expect(assetServiceSpy.sell).toHaveBeenCalledTimes(2);
      expect(assetServiceSpy.sell.mock.calls[1]).toEqual(assetServiceSpy.sell.mock.calls[0]);
    });

    it('locks the form and offers only the same-sale recovery while the result is unknown', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 0 })));
      component.onSell(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Recuperar a mesma venda');
      expect(fixture.nativeElement.textContent).not.toContain('Conciliei o resultado; liberar novas operações');
      component.sellForm.patchValue({ quantity: '0.5', grossAmount: 999 });
      component.allowSellRetry();
      expect(assetServiceSpy.sell.mock.calls[1]).toEqual(assetServiceSpy.sell.mock.calls[0]);
    });

    it('keeps retry blocked when a result consultation fails', () => {
      fillSell();
      assetServiceSpy.sell.mockReturnValue(throwError(() => ({ status: 0 })));
      pocketServiceSpy.getBalance.mockReturnValue(throwError(() => ({ status: 500 })));
      component.onSell();
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
