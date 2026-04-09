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

const base = `${environment.apiUrl}/assets`;

const mockSummary: AssetSummaryDto = {
  id: 1,
  name: 'CDB Banco X',
  category: 'RENDA_FIXA',
  status: 'ACTIVE',
  legalEntityName: 'Banco X',
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
      http.expectOne(base).flush([mockSummary, mockSummary2]);
      expect(service.assets()).toEqual([mockSummary, mockSummary2]);
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
      }).subscribe();
      http.expectOne(`${base}/pension`).flush(pensionDetail);
      expect(service.assets().length).toBe(2);
      expect(service.assets().find(a => a.id === 2)).toBeTruthy();
    });
  });

  // ─── updateAsset() ────────────────────────────────────────────────────────

  describe('updateAsset()', () => {
    it('should PATCH /assets/:id and replace summary in signal', () => {
      service.assets.set([mockSummary]);
      const updated: AssetDetailDto = { ...mockDetail, name: 'CDB Banco X Atualizado' };
      service.updateAsset(1, { name: 'CDB Banco X Atualizado' }).subscribe();
      http.expectOne(`${base}/1`).flush(updated);
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
        grossAmount: 10500, taxAmount: 150, quantity: 1,
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
});