import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssetService } from './asset.service';
import {
  AssetSummaryDto,
  AssetDetailDto,
  InvestmentTransactionDto,
} from '../models/asset.model';
import { environment } from '../../../environments/environment';
import { investmentBaseline } from '../testing/investment-baseline.fixture';

const base = `${environment.apiUrl}/assets`;

const mockSummary: AssetSummaryDto = {
  id: 1,
  name: 'CDB Banco X',
  category: 'RENDA_FIXA',
  status: 'ACTIVE',
  legalEntityName: 'Banco X',
  custodianLegalEntityName: null,
  currentValue: 10500,
  totalInvested: 10000,
  redeemedValue: 0,
};

const mockSummary2: AssetSummaryDto = {
  id: 2,
  name: 'PGBL Banco Y',
  category: 'PREVIDENCIA',
  status: 'ACTIVE',
  legalEntityName: 'Banco Y',
  custodianLegalEntityName: null,
  currentValue: 5200,
  totalInvested: 5000,
  redeemedValue: 0,
};

const mockDetail: AssetDetailDto = {
  id: 1,
  name: 'CDB Banco X',
  category: 'RENDA_FIXA',
  status: 'ACTIVE',
  legalEntity: {
    id: 1,
    cnpj: '12345678000190',
    corporateName: 'Banco X LTDA',
    tradeName: 'Banco X',
    stateRegistration: null,
  },
  custodianLegalEntity: null,
  position: {
    quantity: 1,
    averagePrice: 10000,
    totalInvested: 10000,
    currentValue: 10500,
    redeemedValue: 0,
    lastValuationDate: '2025-01-15',
  },
  fixedIncomeDetails: {
    indexer: 'CDI',
    annualRate: 0.12,
    maturityDate: '2027-01-15',
    taxFree: false,
  },
  pensionDetails: null,
};

const mockTransaction: InvestmentTransactionDto = {
  id: 10,
  type: 'BUY',
  amount: 10000,
  transactionDate: '2024-01-15',
  notes: null,
};

describe('AssetService', () => {
  let service: AssetService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AssetService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssetService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty assets signal', () => {
      expect(service.assets()).toEqual([]);
    });

    it('should start with isLoading false', () => {
      expect(service.isLoading()).toBe(false);
    });
  });

  // ─── loadAssets() ─────────────────────────────────────────────────────────

  describe('loadAssets()', () => {
    it('should GET /assets and set signal', () => {
      service.loadAssets();
      http.expectOne(base).flush([mockSummary2, mockSummary]);
      expect(service.assets()).toEqual([mockSummary2, mockSummary]);
    });

    it('should set isLoading to false after success', () => {
      service.loadAssets();
      http.expectOne(base).flush([]);
      expect(service.isLoading()).toBe(false);
    });

    it('should set isLoading to false after error', () => {
      service.loadAssets();
      http.expectOne(base).flush(null, { status: 500, statusText: 'Server Error' });
      expect(service.isLoading()).toBe(false);
    });
  });

  // ─── getAsset() ───────────────────────────────────────────────────────────

  describe('getAsset()', () => {
    it('should GET /assets/:id', () => {
      let result: AssetDetailDto | undefined;
      service.getAsset(1).subscribe(r => result = r);
      http.expectOne(`${base}/1`).flush(mockDetail);
      expect(result).toEqual(mockDetail);
    });
  });

  // ─── createFixedIncome() ──────────────────────────────────────────────────

  describe('createFixedIncome()', () => {
    it('should POST /assets/fixed-income and append summary to signal', () => {
      service.assets.set([mockSummary2]);
      service.createFixedIncome({
        name: 'CDB Banco X',
        legalEntityId: 1,
        indexer: 'CDI',
        annualRate: 0.12,
        maturityDate: '2027-01-15',
        taxFree: false,
        liquidityType: 'DIARIA',
        custodianLegalEntityId: null,
      }).subscribe();
      http.expectOne(`${base}/fixed-income`).flush(mockDetail);
      expect(service.assets().length).toBe(2);
      expect(service.assets().find(a => a.id === 1)).toBeTruthy();
    });

    it('should use tradeName as legalEntityName when available', () => {
      service.assets.set([]);
      service.createFixedIncome({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 0.12, maturityDate: '2027-01-15', taxFree: false,
        liquidityType: 'DIARIA', custodianLegalEntityId: null,
      }).subscribe();
      http.expectOne(`${base}/fixed-income`).flush(mockDetail);
      expect(service.assets()[0].legalEntityName).toBe('Banco X');
    });

    it('should fall back to corporateName when tradeName is null', () => {
      const detailNoTrade: AssetDetailDto = {
        ...mockDetail,
        legalEntity: { ...mockDetail.legalEntity, tradeName: null },
      };
      service.assets.set([]);
      service.createFixedIncome({
        name: 'CDB Banco X', legalEntityId: 1, indexer: 'CDI',
        annualRate: 0.12, maturityDate: '2027-01-15', taxFree: false,
        liquidityType: 'DIARIA', custodianLegalEntityId: null,
      }).subscribe();
      http.expectOne(`${base}/fixed-income`).flush(detailNoTrade);
      expect(service.assets()[0].legalEntityName).toBe('Banco X LTDA');
    });
  });

  // ─── createPension() ──────────────────────────────────────────────────────

  describe('createPension()', () => {
    it('should POST /assets/pension and append summary to signal', () => {
      const pensionDetail: AssetDetailDto = {
        ...mockDetail,
        id: 2,
        name: 'PGBL Banco Y',
        category: 'PREVIDENCIA',
        fixedIncomeDetails: null,
        pensionDetails: { pensionType: 'PGBL', taxRegime: 'PROGRESSIVO' },
      };
      service.assets.set([mockSummary]);
      service.createPension({
        name: 'PGBL Banco Y', legalEntityId: 1,
        pensionType: 'PGBL', taxRegime: 'PROGRESSIVO',
        custodianLegalEntityId: null,
      }).subscribe();
      http.expectOne(`${base}/pension`).flush(pensionDetail);
      expect(service.assets().length).toBe(2);
      expect(service.assets().find(a => a.id === 2)).toBeTruthy();
    });
  });

  // ─── updateAsset() ────────────────────────────────────────────────────────

  describe('updateAsset()', () => {
    it('should PUT /assets/:id and replace summary in signal', () => {
      service.assets.set([mockSummary]);
      const updated: AssetDetailDto = { ...mockDetail, name: 'CDB Banco X Atualizado' };
      service.updateAsset(1, { name: 'CDB Banco X Atualizado', custodianLegalEntityId: null }).subscribe();
      const request = http.expectOne(`${base}/1`);
      expect(request.request.method).toBe('PUT');
      request.flush(updated);
      expect(service.assets()[0].name).toBe('CDB Banco X Atualizado');
    });
  });

  // ─── deleteAsset() ────────────────────────────────────────────────────────

  describe('deleteAsset()', () => {
    it('should DELETE /assets/:id and remove from signal', () => {
      service.assets.set([mockSummary, mockSummary2]);
      service.deleteAsset(1).subscribe();
      http.expectOne(`${base}/1`).flush(null);
      expect(service.assets().find(a => a.id === 1)).toBeUndefined();
      expect(service.assets().length).toBe(1);
    });
  });

  // ─── updatePosition() ─────────────────────────────────────────────────────

  describe('updatePosition()', () => {
    it('should PATCH /assets/:id/position and update signal', () => {
      service.assets.set([mockSummary]);
      const updated: AssetDetailDto = {
        ...mockDetail,
        position: { ...mockDetail.position, currentValue: 11000, lastValuationDate: '2025-02-01' },
      };
      service.updatePosition(1, { currentValue: 11000, lastValuationDate: '2025-02-01' }).subscribe();
      http.expectOne(`${base}/1/position`).flush(updated);
      expect(service.assets()[0].currentValue).toBe(11000);
    });
  });

  describe('INV-002 custodian summary after writes', () => {
    const custodian = {
      id: 9, cnpj: '98765432000111', corporateName: 'Custodiante LTDA',
      tradeName: 'Custodiante', stateRegistration: null,
    };

    describe.each(['fixed-income', 'pension', 'update', 'position'] as const)('%s', operation => {
      it.each([
        { entity: custodian, expected: 'Custodiante' },
        { entity: { ...custodian, tradeName: null }, expected: 'Custodiante LTDA' },
        { entity: null, expected: null },
      ])('uses the custodian name $expected independently of the issuer', ({ entity, expected }) => {
        const detail: AssetDetailDto = {
          ...mockDetail,
          custodianLegalEntity: entity,
          ...(operation === 'pension' ? {
            category: 'PREVIDENCIA' as const,
            fixedIncomeDetails: null,
            pensionDetails: { pensionType: 'VGBL' as const, taxRegime: 'REGRESSIVO' as const },
          } : {}),
        };
        service.assets.set(operation === 'update' || operation === 'position'
          ? [mockSummary2, mockSummary] : [mockSummary2]);
        const custodianLegalEntityId = entity?.id ?? null;
        if (operation === 'fixed-income') {
          service.createFixedIncome({
            name: detail.name, legalEntityId: detail.legalEntity.id,
            indexer: 'CDI', annualRate: 0.12, maturityDate: '2027-01-15',
            taxFree: false, liquidityType: 'DIARIA', custodianLegalEntityId,
          }).subscribe();
        } else if (operation === 'pension') {
          service.createPension({
            name: detail.name, legalEntityId: detail.legalEntity.id,
            pensionType: 'VGBL', taxRegime: 'REGRESSIVO', custodianLegalEntityId,
          }).subscribe();
        } else if (operation === 'update') {
          service.updateAsset(detail.id, { custodianLegalEntityId }).subscribe();
        } else {
          service.updatePosition(detail.id, {
            currentValue: detail.position.currentValue, lastValuationDate: '2025-01-15',
          }).subscribe();
        }
        const suffix = operation === 'update' ? '/1' : operation === 'position' ? '/1/position' : `/${operation}`;
        const request = http.expectOne(`${base}${suffix}`);
        expect(request.request.method).toBe(operation === 'update' ? 'PUT' : operation === 'position' ? 'PATCH' : 'POST');
        request.flush(detail);
        expect(service.assets()).toHaveLength(2);
        expect(service.assets().at(-1)).toEqual({
          ...mockSummary,
          category: detail.category,
          custodianLegalEntityName: expected,
        });
        expect(service.assets()[0]).toEqual(mockSummary2);
      });
    });
  });

  // ─── getTransactions() ────────────────────────────────────────────────────

  describe('getTransactions()', () => {
    it('should GET /assets/:id/transactions', () => {
      let result: InvestmentTransactionDto[] | undefined;
      service.getTransactions(1).subscribe(r => result = r);
      http.expectOne(`${base}/1/transactions`).flush([mockTransaction]);
      expect(result).toEqual([mockTransaction]);
    });
  });

  // ─── buy() ────────────────────────────────────────────────────────────────

  describe('buy()', () => {
    it('should POST /assets/:id/transactions/buy with correct payload', () => {
      let result: InvestmentTransactionDto | undefined;
      const payload = {
        amount: 1000, quantity: 1, pocketId: 5,
        transactionDate: '2025-01-15', categoryId: 11,
      };
      service.buy(1, payload).subscribe(r => result = r);
      const req = http.expectOne(`${base}/1/transactions/buy`);
      expect(req.request.body).toEqual(payload);
      req.flush(mockTransaction);
      expect(result).toEqual(mockTransaction);
    });
  });

  // ─── recordYield() ────────────────────────────────────────────────────────

  describe('recordYield()', () => {
    it('should POST /assets/:id/transactions/yield with correct payload', () => {
      const yieldTx: InvestmentTransactionDto = { ...mockTransaction, id: 11, type: 'YIELD', amount: 500 };
      let result: InvestmentTransactionDto | undefined;
      const payload = { amount: 500, pocketId: 5, transactionDate: '2025-01-15', categoryId: 12 };
      service.recordYield(1, payload).subscribe(r => result = r);
      const req = http.expectOne(`${base}/1/transactions/yield`);
      expect(req.request.body).toEqual(payload);
      req.flush(yieldTx);
      expect(result).toEqual(yieldTx);
    });
  });

  // ─── sell() ───────────────────────────────────────────────────────────────

  describe('sell()', () => {
    it('should POST /assets/:id/transactions/sell and return two items (SELL + TAX)', () => {
      const sellTx: InvestmentTransactionDto = { ...mockTransaction, id: 12, type: 'SELL', amount: 10500 };
      const taxTx: InvestmentTransactionDto = { ...mockTransaction, id: 13, type: 'TAX', amount: 150 };
      let result: InvestmentTransactionDto[] | undefined;
      const payload = {
        grossAmount: 10500, taxAmount: 150,
        pocketId: 5, transactionDate: '2025-01-15', categoryId: 13,
      };
      service.sell(1, payload).subscribe(r => result = r);
      const req = http.expectOne(`${base}/1/transactions/sell`);
      expect(req.request.body).toEqual(payload);
      req.flush([sellTx, taxTx]);
      expect(result!.length).toBe(2);
      expect(result![0].type).toBe('SELL');
      expect(result![1].type).toBe('TAX');
    });
  });

  describe('INV-001 legacy HTTP baseline', () => {
    const baseline = investmentBaseline;

    it.each(['fixedIncome', 'pension', 'redeemed'] as const)('preserves the original %s detail without extra writes', kind => {
      const detail = baseline()[kind];
      const received = jest.fn();
      service.getAsset(detail.id).subscribe(received);
      const request = http.expectOne(`${base}/${detail.id}`);
      expect(request.request.method).toBe('GET');
      request.flush(detail);
      expect(received).toHaveBeenCalledWith(detail);
      http.expectNone(request => request.method !== 'GET');
    });

    it('keeps all movement IDs, eight decimals, notes, dates and absent/shared cash references', () => {
      const { fixedIncome, transactions } = baseline();
      const received = jest.fn();
      service.getTransactions(fixedIncome.id).subscribe(received);
      const request = http.expectOne(`${base}/${fixedIncome.id}/transactions`);
      expect(request.request.method).toBe('GET');
      // Equal-day ordering is not specified by the old API; preserve what the server sent.
      request.flush(transactions);
      expect(received).toHaveBeenCalledWith(transactions);
      http.expectNone(request => request.method !== 'GET');
    });

    it.each(['fixedIncome', 'pension'] as const)('sends the complete %s creation contract', kind => {
      const data = baseline();
      const payload = kind === 'fixedIncome' ? data.fixedIncomeCreate : data.pensionCreate;
      const result = kind === 'fixedIncome'
        ? service.createFixedIncome(data.fixedIncomeCreate)
        : service.createPension(data.pensionCreate);
      result.subscribe();
      const request = http.expectOne(`${base}/${kind === 'fixedIncome' ? 'fixed-income' : 'pension'}`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(payload);
      request.flush(data[kind]);
      expect(service.assets()[0]).toMatchObject({ id: data[kind].id, category: data[kind].category });
    });

    it('preserves null custodian on PUT and the original valuation date on PATCH', () => {
      const { fixedIncome } = baseline();
      const update = { name: 'Cadastro atualizado', custodianLegalEntityId: null, liquidityType: 'DIARIA' as const };
      service.updateAsset(fixedIncome.id, update).subscribe();
      const metadata = http.expectOne(`${base}/${fixedIncome.id}`);
      expect(metadata.request.method).toBe('PUT');
      expect(metadata.request.body).toEqual(update);
      metadata.flush({ ...fixedIncome, custodianLegalEntity: null });
      const valuation = { currentValue: 550.87654321, lastValuationDate: '2025-12-31' };
      service.updatePosition(fixedIncome.id, valuation).subscribe();
      const position = http.expectOne(`${base}/${fixedIncome.id}/position`);
      expect(position.request.method).toBe('PATCH');
      expect(position.request.body).toEqual(valuation);
      position.flush(fixedIncome);
    });

    it('sends buy.amount as unit price without multiplying it by quantity', () => {
      const { fixedIncome, buy, transactions } = baseline();
      service.buy(fixedIncome.id, buy).subscribe();
      const request = http.expectOne(`${base}/${fixedIncome.id}/transactions/buy`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(buy);
      expect(request.request.serializeBody()).toBe(JSON.stringify(buy));
      request.flush(transactions[1]);
    });

    it('preserves the yield amount, date, category, pocket and notes', () => {
      const { fixedIncome, yieldPayload, transactions } = baseline();
      service.recordYield(fixedIncome.id, yieldPayload).subscribe();
      const request = http.expectOne(`${base}/${fixedIncome.id}/transactions/yield`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(yieldPayload);
      request.flush(transactions[2]);
    });

    it.each([0, 15, 1100])('sends gross and tax %s separately and preserves SELL/TAX responses', taxAmount => {
      const { redeemed, sell, redemptionTransactions } = baseline();
      const payload = { ...sell, taxAmount };
      const response = [redemptionTransactions[1], { ...redemptionTransactions[2], amount: taxAmount }];
      const received = jest.fn();
      service.sell(redeemed.id, payload).subscribe(received);
      const request = http.expectOne(`${base}/${redeemed.id}/transactions/sell`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(payload);
      request.flush(response);
      expect(received).toHaveBeenCalledWith(response);
    });

    it.each([0, 400, 409, 500, 503])('does not automatically replay a legacy sell after HTTP %s', status => {
      const { redeemed, sell } = baseline();
      const failure = jest.fn();
      service.sell(redeemed.id, sell).subscribe({ error: failure });
      const request = http.expectOne(`${base}/${redeemed.id}/transactions/sell`);
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({ message: 'Synthetic failure' }, { status, statusText: 'Synthetic failure' });
      expect(failure).toHaveBeenCalledWith(expect.objectContaining({ status }));
      http.expectNone(request => request.method !== 'GET');
    });
  });
});
