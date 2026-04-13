import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TransferService, TransferPayload, GroupPocketDto } from './transfer.service';
import { environment } from '../../../environments/environment';

describe('TransferService', () => {
  let service: TransferService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.apiUrl;

  const mockGroupPockets: GroupPocketDto[] = [
    { id: 1, type: 'BankAccount',     label: 'Conta Corrente',     user: { id: 2, firstName: 'Ana', lastName: 'Silva', email: 'ana@email.com' } },
    { id: 2, type: 'Cash',            label: 'Dinheiro em espécie', user: { id: 2, firstName: 'Ana', lastName: 'Silva', email: 'ana@email.com' } },
    { id: 3, type: 'BenefitAccount',  label: 'Vale-Refeição',      user: { id: 2, firstName: 'Ana', lastName: 'Silva', email: 'ana@email.com' } },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TransferService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TransferService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('transfer()', () => {
    it('should POST to /transfers with the given payload', () => {
      const payload: TransferPayload = {
        sourcePocketId: 1,
        targetPocketId: 2,
        amount: 500,
        description: 'Teste',
      };

      service.transfer(payload).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/transfers`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(null);
    });
  });

  describe('fgtsWithdrawal()', () => {
    it('should POST to /transfers/fgts/withdrawal with the given payload', () => {
      const payload: TransferPayload = {
        sourcePocketId: 10,
        targetPocketId: 2,
        amount: 1500,
        description: 'Saque aniversário',
      };

      service.fgtsWithdrawal(payload).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/transfers/fgts/withdrawal`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(null);
    });

    it('should complete without error on success', () => {
      const payload: TransferPayload = {
        sourcePocketId: 10,
        targetPocketId: 1,
        amount: 200,
        description: 'Saque FGTS',
      };

      let completed = false;
      service.fgtsWithdrawal(payload).subscribe({ complete: () => (completed = true) });

      httpMock.expectOne(`${baseUrl}/transfers/fgts/withdrawal`).flush(null);
      expect(completed).toBe(true);
    });
  });

  describe('getGroupPockets()', () => {
    it('should GET /groups/{id}/share/pockets', () => {
      service.getGroupPockets(10).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/groups/10/share/pockets`);
      expect(req.request.method).toBe('GET');
      req.flush(mockGroupPockets);
    });

    it('should normalize type from PascalCase to SCREAMING_SNAKE_CASE', () => {
      service.getGroupPockets(10).subscribe(result => {
        expect(result[0].type).toBe('BANK_ACCOUNT');
        expect(result[1].type).toBe('CASH');
      });

      httpMock.expectOne(`${baseUrl}/groups/10/share/pockets`).flush(mockGroupPockets);
    });

    it('should filter out types other than BANK_ACCOUNT and CASH', () => {
      service.getGroupPockets(10).subscribe(result => {
        expect(result.length).toBe(2);
        expect(result.every(p => p.type === 'BANK_ACCOUNT' || p.type === 'CASH')).toBeTruthy();
      });

      httpMock.expectOne(`${baseUrl}/groups/10/share/pockets`).flush(mockGroupPockets);
    });
  });
});