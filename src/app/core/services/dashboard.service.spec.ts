import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DashboardService } from './dashboard.service';
import { environment } from '../../../environments/environment';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DashboardService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─── getDashboard() ───────────────────────────────────────────────────────

  describe('getDashboard()', () => {
    it('should GET /dashboard', () => {
      service.getDashboard().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/dashboard`);
      expect(req.request.method).toBe('GET');
      req.flush({ pockets: [], investments: [], totalOpenBills: 0 });
    });

    it('should return dashboard data', () => {
      const mockData = {
        pockets: [{ category: 'BankAccount', total: 1500 }],
        investments: [{ category: 'RENDA_FIXA', total: 5000 }],
        totalOpenBills: 300,
      };

      service.getDashboard().subscribe(data => {
        expect(data).toEqual(mockData);
      });

      httpMock.expectOne(`${baseUrl}/dashboard`).flush(mockData);
    });
  });

  // ─── getMonthly() ─────────────────────────────────────────────────────────

  describe('getMonthly()', () => {
    it('should GET /dashboard/monthly with startDate and endDate params', () => {
      service.getMonthly('2025-01-01', '2025-12-31').subscribe();

      const req = httpMock.expectOne(r => r.url.endsWith('/dashboard/monthly'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('startDate')).toBe('2025-01-01');
      expect(req.request.params.get('endDate')).toBe('2025-12-31');
      req.flush([]);
    });

    it('should return monthly data array', () => {
      const mockData = [
        { month: '2025-01', totalIncome: 5000, totalExpense: 2000 },
        { month: '2025-02', totalIncome: 0, totalExpense: 1500 },
      ];

      service.getMonthly('2025-01-01', '2025-02-28').subscribe(data => {
        expect(data).toEqual(mockData);
        expect(data.length).toBe(2);
      });

      httpMock.expectOne(r => r.url.endsWith('/dashboard/monthly')).flush(mockData);
    });
  });

  // ─── getCategorySummary() ─────────────────────────────────────────────────

  describe('getCategorySummary()', () => {
    it('should GET /dashboard/summary with startDate and endDate params', () => {
      service.getCategorySummary('2025-03-01', '2025-03-31').subscribe();

      const req = httpMock.expectOne(r => r.url.endsWith('/dashboard/summary'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('startDate')).toBe('2025-03-01');
      expect(req.request.params.get('endDate')).toBe('2025-03-31');
      req.flush({ incomes: [], expenses: [] });
    });

    it('should return incomes and expenses', () => {
      const mockData = {
        incomes: [{ category: 'Salário', total: 5000 }],
        expenses: [{ category: 'Alimentação', total: 800 }],
      };

      service.getCategorySummary('2025-03-01', '2025-03-31').subscribe(data => {
        expect(data.incomes.length).toBe(1);
        expect(data.expenses.length).toBe(1);
        expect(data.incomes[0].category).toBe('Salário');
      });

      httpMock.expectOne(r => r.url.endsWith('/dashboard/summary')).flush(mockData);
    });
  });

  // ─── getGroupDashboard() ──────────────────────────────────────────────────

  describe('getGroupDashboard()', () => {
    it('should GET /groups/:id/dashboard', () => {
      service.getGroupDashboard(5).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/groups/5/dashboard`);
      expect(req.request.method).toBe('GET');
      req.flush({ members: [] });
    });

    it('should return group dashboard with members', () => {
      const mockData = {
        members: [{
          user: { id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@test.com' },
          pockets: [{ category: 'BankAccount', total: 2000 }],
          investments: null,
          totalOpenBills: 150,
        }],
      };

      service.getGroupDashboard(5).subscribe(data => {
        expect(data.members.length).toBe(1);
        expect(data.members[0].user.id).toBe(1);
      });

      httpMock.expectOne(`${baseUrl}/groups/5/dashboard`).flush(mockData);
    });
  });

  // ─── getGroupMonthly() ────────────────────────────────────────────────────

  describe('getGroupMonthly()', () => {
    it('should GET /groups/:id/dashboard/monthly with date params', () => {
      service.getGroupMonthly(5, '2025-01-01', '2025-12-31').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/groups/5/dashboard/monthly'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('startDate')).toBe('2025-01-01');
      expect(req.request.params.get('endDate')).toBe('2025-12-31');
      req.flush({ members: [] });
    });

    it('should return group monthly data with null for non-sharing members', () => {
      const mockData = {
        members: [
          {
            user: { id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@test.com' },
            monthly: [{ month: '2025-03', totalIncome: 5000, totalExpense: 0 }],
          },
          {
            user: { id: 2, firstName: 'Ana', lastName: 'Lima', email: 'ana@test.com' },
            monthly: null,
          },
        ],
      };

      service.getGroupMonthly(5, '2025-01-01', '2025-12-31').subscribe(data => {
        expect(data.members[0].monthly).not.toBeNull();
        expect(data.members[1].monthly).toBeNull();
      });

      httpMock.expectOne(r => r.url.includes('/groups/5/dashboard/monthly')).flush(mockData);
    });
  });

  // ─── getGroupCategorySummary() ────────────────────────────────────────────

  describe('getGroupCategorySummary()', () => {
    it('should GET /groups/:id/dashboard/summary with date params', () => {
      service.getGroupCategorySummary(5, '2025-03-01', '2025-03-31').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/groups/5/dashboard/summary'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('startDate')).toBe('2025-03-01');
      expect(req.request.params.get('endDate')).toBe('2025-03-31');
      req.flush({ members: [] });
    });

    it('should return group category summary with member data', () => {
      const mockData = {
        members: [{
          user: { id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@test.com' },
          incomes: [{ category: 'Salário', total: 5200 }],
          expenses: [{ category: 'Alimentação', total: 651.12 }],
        }],
      };

      service.getGroupCategorySummary(5, '2025-03-01', '2025-03-31').subscribe(data => {
        expect(data.members.length).toBe(1);
        expect(data.members[0].incomes?.[0].category).toBe('Salário');
      });

      httpMock.expectOne(r => r.url.includes('/groups/5/dashboard/summary')).flush(mockData);
    });
  });
});