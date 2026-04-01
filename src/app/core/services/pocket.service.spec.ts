import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PocketService } from './pocket.service';
import {
  PocketSummaryDto,
  BankAccountDto,
  BenefitAccountDto,
  FgtsEmployerAccountDto,
  CashDto,
} from '../models/pocket.model';
import { environment } from '../../../environments/environment';

const base = environment.apiUrl;

const mockSummaryBank: PocketSummaryDto = { id: 1, type: 'BANK_ACCOUNT', label: 'Banco X – Corrente', balance: 1500 };
const mockSummaryCash: PocketSummaryDto = { id: 2, type: 'CASH', label: 'Carteira', balance: 200 };

const mockBankAccount: BankAccountDto = {
  id: 1,
  legalEntityCorporateName: 'Banco X',
  number: '12345-6',
  agency: '0001',
  bankAccountType: 'Corrente',
  status: 'ACTIVE',
};

const mockBenefitAccount: BenefitAccountDto = {
  id: 3,
  legalEntityCorporateName: 'Empresa Y',
  benefitType: 'Vale-Alimentação',
  status: 'ACTIVE',
};

const mockFgts: FgtsEmployerAccountDto = {
  id: 4,
  employerName: 'Empresa Z',
  admissionDate: '2020-01-01',
  dismissalDate: null,
  status: 'ACTIVE',
};

const mockCash: CashDto = { id: 2, balance: 200 };

describe('PocketService', () => {
  let service: PocketService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PocketService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PocketService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty pockets', () => {
      expect(service.pockets()).toEqual([]);
    });
  });

  // ─── loadPockets() ────────────────────────────────────────────────────────

  describe('loadPockets()', () => {
    it('should load and set pockets signal', () => {
      service.loadPockets().subscribe();
      http.expectOne(`${base}/pockets/my`).flush([mockSummaryBank, mockSummaryCash]);
      expect(service.pockets()).toEqual([mockSummaryBank, mockSummaryCash]);
    });
  });

  // ─── Conta Bancária ───────────────────────────────────────────────────────

  describe('getBankAccount()', () => {
    it('should GET bank account by id', () => {
      let result: BankAccountDto | undefined;
      service.getBankAccount(1).subscribe(r => result = r);
      http.expectOne(`${base}/pockets/bank-accounts/1`).flush(mockBankAccount);
      expect(result).toEqual(mockBankAccount);
    });
  });

  describe('createBankAccount()', () => {
    it('should POST and reload pockets', () => {
      service.createBankAccount({ legalEntityId: 1, number: '12345-6', agency: '0001', bankAccountTypeId: 1 }).subscribe();
      http.expectOne(`${base}/pockets/bank-accounts`).flush(mockBankAccount);
      http.expectOne(`${base}/pockets/my`).flush([mockSummaryBank]);
      expect(service.pockets()).toEqual([mockSummaryBank]);
    });
  });

  describe('updateBankAccount()', () => {
    it('should PUT and reload pockets', () => {
      service.updateBankAccount(1, { status: 'INACTIVE' }).subscribe();
      http.expectOne(`${base}/pockets/bank-accounts/1`).flush({ ...mockBankAccount, status: 'INACTIVE' });
      http.expectOne(`${base}/pockets/my`).flush([{ ...mockSummaryBank }]);
      expect(service.pockets().length).toBe(1);
    });
  });

  describe('deleteBankAccount()', () => {
    it('should DELETE and remove pocket from signal locally', () => {
      service['_pockets'].set([mockSummaryBank, mockSummaryCash]);
      service.deleteBankAccount(1).subscribe();
      http.expectOne(`${base}/pockets/bank-accounts/1`).flush(null);
      expect(service.pockets().find(p => p.id === 1)).toBeUndefined();
      expect(service.pockets().length).toBe(1);
    });
  });

  // ─── Conta de Benefício ───────────────────────────────────────────────────

  describe('getBenefitAccount()', () => {
    it('should GET benefit account by id', () => {
      let result: BenefitAccountDto | undefined;
      service.getBenefitAccount(3).subscribe(r => result = r);
      http.expectOne(`${base}/pockets/benefit-accounts/3`).flush(mockBenefitAccount);
      expect(result).toEqual(mockBenefitAccount);
    });
  });

  describe('createBenefitAccount()', () => {
    it('should POST and reload pockets', () => {
      service.createBenefitAccount({ legalEntityId: 1, benefitTypeId: 1 }).subscribe();
      http.expectOne(`${base}/pockets/benefit-accounts`).flush(mockBenefitAccount);
      http.expectOne(`${base}/pockets/my`).flush([mockSummaryBank]);
      expect(service.pockets().length).toBe(1);
    });
  });

  describe('deleteBenefitAccount()', () => {
    it('should DELETE and remove pocket from signal locally', () => {
      service['_pockets'].set([mockSummaryBank, { id: 3, type: 'BENEFIT_ACCOUNT', label: 'VA', balance: 300 }]);
      service.deleteBenefitAccount(3).subscribe();
      http.expectOne(`${base}/pockets/benefit-accounts/3`).flush(null);
      expect(service.pockets().find(p => p.id === 3)).toBeUndefined();
      expect(service.pockets().length).toBe(1);
    });
  });

  // ─── FGTS ─────────────────────────────────────────────────────────────────

  describe('getFgts()', () => {
    it('should GET fgts by id', () => {
      let result: FgtsEmployerAccountDto | undefined;
      service.getFgts(4).subscribe(r => result = r);
      http.expectOne(`${base}/pockets/fgts/4`).flush(mockFgts);
      expect(result).toEqual(mockFgts);
    });
  });

  describe('createFgts()', () => {
    it('should POST and reload pockets', () => {
      service.createFgts({ employerId: 1, admissionDate: '2020-01-01' }).subscribe();
      http.expectOne(`${base}/pockets/fgts`).flush(mockFgts);
      http.expectOne(`${base}/pockets/my`).flush([mockSummaryBank]);
      expect(service.pockets().length).toBe(1);
    });
  });

  describe('deleteFgts()', () => {
    it('should DELETE and remove pocket from signal locally', () => {
      service['_pockets'].set([mockSummaryBank, { id: 4, type: 'FGTS_EMPLOYER_ACCOUNT', label: 'FGTS', balance: 5000 }]);
      service.deleteFgts(4).subscribe();
      http.expectOne(`${base}/pockets/fgts/4`).flush(null);
      expect(service.pockets().find(p => p.id === 4)).toBeUndefined();
      expect(service.pockets().length).toBe(1);
    });
  });

  // ─── Cash ─────────────────────────────────────────────────────────────────

  describe('getCash()', () => {
    it('should GET cash pocket', () => {
      let result: CashDto | undefined;
      service.getCash().subscribe(r => result = r);
      http.expectOne(`${base}/pockets/cash`).flush(mockCash);
      expect(result).toEqual(mockCash);
    });
  });

  describe('createCash()', () => {
    it('should POST and reload pockets', () => {
      service.createCash().subscribe();
      http.expectOne(`${base}/pockets/cash`).flush(mockCash);
      http.expectOne(`${base}/pockets/my`).flush([mockSummaryCash]);
      expect(service.pockets()).toEqual([mockSummaryCash]);
    });
  });
});