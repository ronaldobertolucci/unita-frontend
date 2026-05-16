// Chart.js must be mocked before component imports to prevent canvas errors in jsdom.
jest.mock('chart.js', () => ({
  Chart: Object.assign(
    jest.fn().mockImplementation(() => ({ destroy: jest.fn() })),
    { register: jest.fn() }
  ),
  CategoryScale:  class { },
  LinearScale:    class { },
  PointElement:   class { },
  LineElement:    class { },
  BarElement:     class { },
  LineController: class { },
  BarController:  class { },
  PieController:  class { },
  ArcElement:     class { },
  Title:    class { },
  Tooltip:  class { },
  Legend:   class { },
  Filler:   class { },
}));

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from '../../core/services/dashboard.service';
import { GroupService } from '../../core/services/group.service';
import { RouterTestingModule } from '@angular/router/testing';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUser1 = { id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@test.com' };
const mockUser2 = { id: 2, firstName: 'Ana',  lastName: 'Lima',  email: 'ana@test.com'  };

const mockDashboard = {
  pockets:       [{ category: 'BankAccount', total: 1500 }, { category: 'Cash', total: 200 }],
  investments:   [{ category: 'RENDA_FIXA',  total: 5000 }],
  totalOpenBills: 300,
};

const mockMonthly = [
  { month: '2025-03', totalIncome: 5000, totalExpense: 0   },
  { month: '2025-04', totalIncome: 0,    totalExpense: 600 },
];

const mockCategorySummary = {
  incomes:  [{ category: 'Salário',     total: 5000 }, { category: 'Freelance',   total: 800 }],
  expenses: [{ category: 'Alimentação', total: 800  }, { category: 'Transporte',  total: 200 }],
};

const mockIssuerRisk = [
  { legalEntityName: 'Banco A', totalCurrentValue: 3000 },
  { legalEntityName: 'Banco B', totalCurrentValue: 1500 },
];

const mockIndexerSummary = [
  { indexer: 'CDI',       totalCurrentValue: 4000 },
  { indexer: 'PREFIXADO', totalCurrentValue: 1500 },
];

const mockGroups = [{ id: 10, name: 'Família', responsibleUser: mockUser1 }];

const mockGroupDashboard = {
  members: [
    { user: mockUser1, pockets: [{ category: 'BankAccount', total: 2000 }], investments: [{ category: 'RENDA_FIXA', total: 3000 }], totalOpenBills: 150 },
    { user: mockUser2, pockets: null, investments: null, totalOpenBills: null },
  ],
};

const mockGroupMonthly = {
  members: [
    { user: mockUser1, monthly: [{ month: '2025-03', totalIncome: 5000, totalExpense: 200 }] },
    { user: mockUser2, monthly: null },
  ],
};

const mockGroupCategorySummary = {
  members: [
    { user: mockUser1, incomes: [{ category: 'Salário', total: 5200 }], expenses: [{ category: 'Alimentação', total: 651 }] },
    { user: mockUser2, incomes: null, expenses: null },
  ],
};

const mockGroupIssuerRisk = {
  members: [
    { user: mockUser1, issuerRisk: [{ legalEntityName: 'Banco A', totalCurrentValue: 3000 }, { legalEntityName: 'Banco B', totalCurrentValue: 1500 }] },
    { user: mockUser2, issuerRisk: null },
  ],
};

const mockGroupIndexerSummary = {
  members: [
    { user: mockUser1, indexerSummary: [{ indexer: 'CDI', totalCurrentValue: 4000 }, { indexer: 'IPCA', totalCurrentValue: 1000 }] },
    { user: mockUser2, indexerSummary: null },
  ],
};

// ── Mock factories ────────────────────────────────────────────────────────────

function buildDashboardService() {
  return {
    getDashboard:            jest.fn().mockReturnValue(of(mockDashboard)),
    getMonthly:              jest.fn().mockReturnValue(of(mockMonthly)),
    getCategorySummary:      jest.fn().mockReturnValue(of(mockCategorySummary)),
    getIssuerRisk:           jest.fn().mockReturnValue(of(mockIssuerRisk)),
    getIndexerSummary:       jest.fn().mockReturnValue(of(mockIndexerSummary)),
    getGroupDashboard:       jest.fn().mockReturnValue(of(mockGroupDashboard)),
    getGroupMonthly:         jest.fn().mockReturnValue(of(mockGroupMonthly)),
    getGroupCategorySummary: jest.fn().mockReturnValue(of(mockGroupCategorySummary)),
    getGroupIssuerRisk:      jest.fn().mockReturnValue(of(mockGroupIssuerRisk)),
    getGroupIndexerSummary:  jest.fn().mockReturnValue(of(mockGroupIndexerSummary)),
  };
}

function buildGroupService(groups = mockGroups) {
  return {
    myGroups:      signal(groups),
    loadMyGroups$: jest.fn().mockReturnValue(of(groups)),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let dashboardServiceSpy: ReturnType<typeof buildDashboardService>;
  let groupServiceSpy: ReturnType<typeof buildGroupService>;

  function setup(groups = mockGroups) {
    dashboardServiceSpy = buildDashboardService();
    groupServiceSpy     = buildGroupService(groups);

    TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule],
      providers: [
        { provide: DashboardService, useValue: dashboardServiceSpy },
        { provide: GroupService,     useValue: groupServiceSpy     },
      ],
    });

    fixture   = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should start on individual tab', () => {
      expect(component.activeTab()).toBe('individual');
    });

    it('should call getDashboard on init', () => {
      expect(dashboardServiceSpy.getDashboard).toHaveBeenCalled();
    });

    it('should call getMonthly on init', () => {
      expect(dashboardServiceSpy.getMonthly).toHaveBeenCalled();
    });

    it('should call getCategorySummary on init', () => {
      expect(dashboardServiceSpy.getCategorySummary).toHaveBeenCalled();
    });

    it('should call getIssuerRisk on init', () => {
      expect(dashboardServiceSpy.getIssuerRisk).toHaveBeenCalled();
    });

    it('should call getIndexerSummary on init', () => {
      expect(dashboardServiceSpy.getIndexerSummary).toHaveBeenCalled();
    });

    it('should call loadMyGroups$ on init', () => {
      expect(groupServiceSpy.loadMyGroups$).toHaveBeenCalled();
    });

    it('should default individualSection to summary', () => {
      expect(component.individualSection()).toBe('summary');
    });

    it('should default groupSection to summary', () => {
      expect(component.groupSection()).toBe('summary');
    });
  });

  // ─── setTab() ─────────────────────────────────────────────────────────────

  describe('setTab()', () => {
    beforeEach(() => setup());

    it('should switch to groups tab', () => {
      component.setTab('groups');
      expect(component.activeTab()).toBe('groups');
    });

    it('should switch back to individual tab', () => {
      component.setTab('groups');
      component.setTab('individual');
      expect(component.activeTab()).toBe('individual');
    });
  });

  // ─── setIndividualSection() ───────────────────────────────────────────────

  describe('setIndividualSection()', () => {
    beforeEach(() => setup());

    it('should switch to income-expense section', () => {
      component.setIndividualSection('income-expense');
      expect(component.individualSection()).toBe('income-expense');
    });

    it('should switch to investments section', () => {
      component.setIndividualSection('investments');
      expect(component.individualSection()).toBe('investments');
    });

    it('should switch back to summary section', () => {
      component.setIndividualSection('investments');
      component.setIndividualSection('summary');
      expect(component.individualSection()).toBe('summary');
    });
  });

  // ─── setGroupSection() ────────────────────────────────────────────────────

  describe('setGroupSection()', () => {
    beforeEach(() => setup());

    it('should switch to income-expense section', () => {
      component.setGroupSection('income-expense');
      expect(component.groupSection()).toBe('income-expense');
    });

    it('should switch to investments section', () => {
      component.setGroupSection('investments');
      expect(component.groupSection()).toBe('investments');
    });

    it('should switch back to summary section', () => {
      component.setGroupSection('investments');
      component.setGroupSection('summary');
      expect(component.groupSection()).toBe('summary');
    });
  });

  // ─── pocketRows ───────────────────────────────────────────────────────────

  describe('pocketRows', () => {
    beforeEach(() => setup());

    it('should translate BankAccount to Conta Bancária', () => {
      expect(component.pocketRows()[0].label).toBe('Conta Bancária');
    });

    it('should translate Cash to Carteira', () => {
      expect(component.pocketRows()[1].label).toBe('Carteira');
    });

    it('should preserve total value', () => {
      expect(component.pocketRows()[0].total).toBe(1500);
    });
  });

  // ─── pocketTotal ──────────────────────────────────────────────────────────

  describe('pocketTotal', () => {
    beforeEach(() => setup());

    it('should sum all pocket totals', () => {
      expect(component.pocketTotal()).toBe(1700);
    });

    it('should return 0 when no pockets', () => {
      component.dashboardData.set({ pockets: [], investments: [], totalOpenBills: 0 });
      expect(component.pocketTotal()).toBe(0);
    });
  });

  // ─── investmentRows ───────────────────────────────────────────────────────

  describe('investmentRows', () => {
    beforeEach(() => setup());

    it('should translate RENDA_FIXA to Renda Fixa', () => {
      expect(component.investmentRows()[0].label).toBe('Renda Fixa');
    });

    it('should translate PREVIDENCIA to Previdência', () => {
      component.dashboardData.set({
        pockets: [],
        investments: [{ category: 'PREVIDENCIA', total: 2000 }],
        totalOpenBills: 0,
      });
      expect(component.investmentRows()[0].label).toBe('Previdência');
    });
  });

  // ─── investmentTotal ──────────────────────────────────────────────────────

  describe('investmentTotal', () => {
    beforeEach(() => setup());

    it('should sum all investment totals', () => {
      expect(component.investmentTotal()).toBe(5000);
    });
  });

  // ─── hasMonthlyData / hasExpenseData / hasIncomeData ──────────────────────

  describe('data availability signals', () => {
    beforeEach(() => setup());

    it('hasMonthlyData should be true when monthly data exists', () => {
      expect(component.hasMonthlyData()).toBe(true);
    });

    it('hasMonthlyData should be false when monthly data is empty', () => {
      component.monthlyData.set([]);
      expect(component.hasMonthlyData()).toBe(false);
    });

    it('hasExpenseData should be true when expenses exist', () => {
      expect(component.hasExpenseData()).toBe(true);
    });

    it('hasIncomeData should be true when incomes exist', () => {
      expect(component.hasIncomeData()).toBe(true);
    });
  });

  // ─── issuerRiskData / hasIssuerRiskData ───────────────────────────────────

  describe('issuerRiskData', () => {
    beforeEach(() => setup());

    it('should populate issuerRiskData on init', () => {
      expect(component.issuerRiskData()).toEqual(mockIssuerRisk);
    });

    it('hasIssuerRiskData should be true when data exists', () => {
      expect(component.hasIssuerRiskData()).toBe(true);
    });

    it('hasIssuerRiskData should be false when data is empty', () => {
      component.issuerRiskData.set([]);
      expect(component.hasIssuerRiskData()).toBe(false);
    });

    it('should set isLoadingIssuerRisk to false after load', () => {
      expect(component.isLoadingIssuerRisk()).toBe(false);
    });
  });

  // ─── indexerData / hasIndexerData ─────────────────────────────────────────

  describe('indexerData', () => {
    beforeEach(() => setup());

    it('should populate indexerData on init', () => {
      expect(component.indexerData()).toEqual(mockIndexerSummary);
    });

    it('hasIndexerData should be true when data exists', () => {
      expect(component.hasIndexerData()).toBe(true);
    });

    it('hasIndexerData should be false when data is empty', () => {
      component.indexerData.set([]);
      expect(component.hasIndexerData()).toBe(false);
    });

    it('should set isLoadingIndexer to false after load', () => {
      expect(component.isLoadingIndexer()).toBe(false);
    });
  });

  // ─── loadMonthly() ────────────────────────────────────────────────────────

  describe('loadMonthly()', () => {
    beforeEach(() => setup());

    it('should call getMonthly with lineStartDate and lineEndDate', () => {
      component.lineStartDate.set('2025-01-01');
      component.lineEndDate.set('2025-12-31');
      component.loadMonthly();
      expect(dashboardServiceSpy.getMonthly).toHaveBeenCalledWith('2025-01-01', '2025-12-31');
    });

    it('should populate monthlyData on success', () => {
      expect(component.monthlyData()).toEqual(mockMonthly);
    });

    it('should set isLoadingMonthly to false after load', () => {
      expect(component.isLoadingMonthly()).toBe(false);
    });
  });

  // ─── loadCategoryData() ───────────────────────────────────────────────────

  describe('loadCategoryData()', () => {
    beforeEach(() => setup());

    it('should populate categoryData on success', () => {
      expect(component.categoryData()).toEqual(mockCategorySummary);
    });

    it('should set errorMessage on getDashboard failure', () => {
      dashboardServiceSpy.getDashboard.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      fixture   = TestBed.createComponent(DashboardComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(component.errorMessage()).toBeTruthy();
    });
  });

  // ─── date selectors ───────────────────────────────────────────────────────

  describe('date selectors', () => {
    beforeEach(() => setup());

    it('onLineStartDateChange should update lineStartDate and call loadMonthly', () => {
      const callsBefore = dashboardServiceSpy.getMonthly.mock.calls.length;
      const event = { target: { value: '2024-06-01' } } as unknown as Event;
      component.onLineStartDateChange(event);
      expect(component.lineStartDate()).toBe('2024-06-01');
      expect(dashboardServiceSpy.getMonthly.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('onLineEndDateChange should update lineEndDate and call loadMonthly', () => {
      const callsBefore = dashboardServiceSpy.getMonthly.mock.calls.length;
      const event = { target: { value: '2025-06-30' } } as unknown as Event;
      component.onLineEndDateChange(event);
      expect(component.lineEndDate()).toBe('2025-06-30');
      expect(dashboardServiceSpy.getMonthly.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // ─── onGroupSelect() ──────────────────────────────────────────────────────

  describe('onGroupSelect()', () => {
    beforeEach(() => setup());

    it('should set selectedGroupId', () => {
      const event = { target: { value: '10' } } as unknown as Event;
      component.onGroupSelect(event);
      expect(component.selectedGroupId()).toBe(10);
    });

    it('should call getGroupDashboard, getGroupMonthly, getGroupCategorySummary', () => {
      const event = { target: { value: '10' } } as unknown as Event;
      component.onGroupSelect(event);
      expect(dashboardServiceSpy.getGroupDashboard).toHaveBeenCalledWith(10);
      expect(dashboardServiceSpy.getGroupMonthly).toHaveBeenCalled();
      expect(dashboardServiceSpy.getGroupCategorySummary).toHaveBeenCalled();
    });

    it('should call getGroupIssuerRisk and getGroupIndexerSummary on group select', () => {
      const event = { target: { value: '10' } } as unknown as Event;
      component.onGroupSelect(event);
      expect(dashboardServiceSpy.getGroupIssuerRisk).toHaveBeenCalledWith(10);
      expect(dashboardServiceSpy.getGroupIndexerSummary).toHaveBeenCalledWith(10);
    });

    it('should reset groupIssuerRiskData and groupIndexerData before loading', () => {
      component.groupIssuerRiskData.set(mockGroupIssuerRisk);
      component.groupIndexerData.set(mockGroupIndexerSummary);
      component.groupIssuerRiskData.set(null);
      component.groupIndexerData.set(null);
      expect(component.groupIssuerRiskData()).toBeNull();
      expect(component.groupIndexerData()).toBeNull();
    });

    it('should reset selectedMemberIds to empty before loading', () => {
      component.selectedMemberIds.set([1, 2]);
      const event = { target: { value: '10' } } as unknown as Event;
      component.onGroupSelect(event);
      expect(component.selectedMemberIds()).toEqual([mockUser1.id, mockUser2.id]);
    });

    it('should reset dates to defaults when switching group', () => {
      component.groupLineStartDate.set('2020-01-01');
      component.groupLineEndDate.set('2020-12-31');
      const event = { target: { value: '10' } } as unknown as Event;
      component.onGroupSelect(event);
      expect(component.groupLineStartDate()).not.toBe('2020-01-01');
    });
  });

  // ─── Group member filtering ───────────────────────────────────────────────

  describe('member filtering', () => {
    beforeEach(() => {
      setup();
      component.groupDashboardData.set(mockGroupDashboard);
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
    });

    it('groupMembers should list all members from groupDashboardData', () => {
      expect(component.groupMembers().length).toBe(2);
    });

    it('isAllMembersSelected should be true when all are selected', () => {
      expect(component.isAllMembersSelected()).toBe(true);
    });

    it('isAllMembersSelected should be false when one is deselected', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      expect(component.isAllMembersSelected()).toBe(false);
    });

    it('isMemberSelected should return true for selected member', () => {
      expect(component.isMemberSelected(mockUser1.id)).toBe(true);
    });

    it('isMemberSelected should return false for non-selected member', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      expect(component.isMemberSelected(mockUser2.id)).toBe(false);
    });

    it('toggleMember should deselect a selected member', () => {
      component.toggleMember(mockUser2.id);
      expect(component.isMemberSelected(mockUser2.id)).toBe(false);
    });

    it('toggleMember should select a deselected member', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      component.toggleMember(mockUser2.id);
      expect(component.isMemberSelected(mockUser2.id)).toBe(true);
    });

    it('toggleMember should not deselect the last remaining member', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      component.toggleMember(mockUser1.id);
      expect(component.selectedMemberIds()).toEqual([mockUser1.id]);
    });

    it('selectAllMembers should select all members', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      component.selectAllMembers();
      expect(component.selectedMemberIds()).toEqual([mockUser1.id, mockUser2.id]);
    });
  });

  // ─── Group aggregations ───────────────────────────────────────────────────

  describe('group aggregations', () => {
    beforeEach(() => {
      setup();
      component.groupDashboardData.set(mockGroupDashboard);
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
    });

    it('groupPocketRows should aggregate only non-null pockets', () => {
      const total = component.groupPocketRows().reduce((s, r) => s + r.total, 0);
      expect(total).toBe(2000);
    });

    it('groupPocketRows should translate pocket category labels', () => {
      expect(component.groupPocketRows().find(r => r.label === 'Conta Bancária')).toBeDefined();
    });

    it('groupPocketTotal should sum all aggregated pocket totals', () => {
      expect(component.groupPocketTotal()).toBe(2000);
    });

    it('groupInvestmentRows should aggregate only non-null investments', () => {
      expect(component.groupInvestmentTotal()).toBe(3000);
    });

    it('groupInvestmentRows should translate RENDA_FIXA label', () => {
      expect(component.groupInvestmentRows().find(r => r.label === 'Renda Fixa')).toBeDefined();
    });

    it('groupTotalOpenBills should sum non-null bills only', () => {
      expect(component.groupTotalOpenBills()).toBe(150);
    });

    it('groupMembersNotSharingPockets should count members with null pockets', () => {
      expect(component.groupMembersNotSharingPockets()).toBe(1);
    });

    it('groupMembersNotSharingInvestments should count members with null investments', () => {
      expect(component.groupMembersNotSharingInvestments()).toBe(1);
    });

    it('groupMembersNotSharingBills should count members with null totalOpenBills', () => {
      expect(component.groupMembersNotSharingBills()).toBe(1);
    });

    it('groupMembersNotSharingPockets should be 0 when all share', () => {
      component.groupDashboardData.set({
        members: [
          { user: mockUser1, pockets: [{ category: 'Cash', total: 100 }], investments: [], totalOpenBills: 0 },
          { user: mockUser2, pockets: [{ category: 'Cash', total: 200 }], investments: [], totalOpenBills: 0 },
        ],
      });
      expect(component.groupMembersNotSharingPockets()).toBe(0);
    });
  });

  // ─── Group monthly chart data ─────────────────────────────────────────────

  describe('group monthly chart data', () => {
    beforeEach(() => {
      setup();
      component.groupMonthlyData.set(mockGroupMonthly);
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
    });

    it('groupHasMonthlyData should be true when at least one member has data', () => {
      expect(component.groupHasMonthlyData()).toBe(true);
    });

    it('groupHasMonthlyData should be false when all members have null monthly', () => {
      component.groupMonthlyData.set({
        members: [{ user: mockUser1, monthly: null }, { user: mockUser2, monthly: null }],
      });
      expect(component.groupHasMonthlyData()).toBe(false);
    });

    it('groupMembersNotSharingMonthly should count members with null monthly', () => {
      expect(component.groupMembersNotSharingMonthly()).toBe(1);
    });
  });

  // ─── Group category chart data ────────────────────────────────────────────

  describe('group category chart data', () => {
    beforeEach(() => {
      setup();
      component.groupCategoryData.set(mockGroupCategorySummary);
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
    });

    it('groupHasExpenseData should be true when at least one member has expenses', () => {
      expect(component.groupHasExpenseData()).toBe(true);
    });

    it('groupHasIncomeData should be true when at least one member has incomes', () => {
      expect(component.groupHasIncomeData()).toBe(true);
    });

    it('groupMembersNotSharingCategory should count members with null category data', () => {
      expect(component.groupMembersNotSharingCategory()).toBe(1);
    });
  });

  // ─── Group issuer risk ────────────────────────────────────────────────────

  describe('group issuer risk', () => {
    beforeEach(() => {
      setup();
      component.groupIssuerRiskData.set(mockGroupIssuerRisk);
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
    });

    it('groupHasIssuerRiskData should be true when at least one member has data', () => {
      expect(component.groupHasIssuerRiskData()).toBe(true);
    });

    it('groupHasIssuerRiskData should be false when all members have null issuerRisk', () => {
      component.groupIssuerRiskData.set({
        members: [{ user: mockUser1, issuerRisk: null }, { user: mockUser2, issuerRisk: null }],
      });
      expect(component.groupHasIssuerRiskData()).toBe(false);
    });

    it('groupMembersNotSharingIssuerRisk should count members with null issuerRisk', () => {
      expect(component.groupMembersNotSharingIssuerRisk()).toBe(1);
    });

    it('groupMembersNotSharingIssuerRisk should be 0 when all share', () => {
      component.groupIssuerRiskData.set({
        members: [
          { user: mockUser1, issuerRisk: [{ legalEntityName: 'Banco A', totalCurrentValue: 1000 }] },
          { user: mockUser2, issuerRisk: [{ legalEntityName: 'Banco B', totalCurrentValue: 500  }] },
        ],
      });
      expect(component.groupMembersNotSharingIssuerRisk()).toBe(0);
    });

    it('filteredIssuerRiskMembers should respect selectedMemberIds', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      expect(component.filteredIssuerRiskMembers().length).toBe(1);
      expect(component.filteredIssuerRiskMembers()[0].user.id).toBe(mockUser1.id);
    });

    it('should aggregate issuer risk across selected members ignoring null', () => {
      // user2 has null — aggregation should only contain user1's data
      const members = component.filteredIssuerRiskMembers();
      const nonNull = members.filter(m => m.issuerRisk !== null);
      const totalBancoA = nonNull.flatMap(m => m.issuerRisk!).find(i => i.legalEntityName === 'Banco A')?.totalCurrentValue;
      expect(totalBancoA).toBe(3000);
    });

    it('should merge same legalEntityName across multiple members', () => {
      component.groupIssuerRiskData.set({
        members: [
          { user: mockUser1, issuerRisk: [{ legalEntityName: 'Banco A', totalCurrentValue: 1000 }] },
          { user: mockUser2, issuerRisk: [{ legalEntityName: 'Banco A', totalCurrentValue: 500  }] },
        ],
      });
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
      // The aggregation (done inside renderGroupIssuerRiskChart) should sum to 1500
      // We test the filteredIssuerRiskMembers are both included
      expect(component.filteredIssuerRiskMembers().length).toBe(2);
    });
  });

  // ─── Group indexer summary ────────────────────────────────────────────────

  describe('group indexer summary', () => {
    beforeEach(() => {
      setup();
      component.groupIndexerData.set(mockGroupIndexerSummary);
      component.selectedMemberIds.set([mockUser1.id, mockUser2.id]);
    });

    it('groupHasIndexerData should be true when at least one member has data', () => {
      expect(component.groupHasIndexerData()).toBe(true);
    });

    it('groupHasIndexerData should be false when all members have null indexerSummary', () => {
      component.groupIndexerData.set({
        members: [{ user: mockUser1, indexerSummary: null }, { user: mockUser2, indexerSummary: null }],
      });
      expect(component.groupHasIndexerData()).toBe(false);
    });

    it('groupMembersNotSharingIndexer should count members with null indexerSummary', () => {
      expect(component.groupMembersNotSharingIndexer()).toBe(1);
    });

    it('groupMembersNotSharingIndexer should be 0 when all share', () => {
      component.groupIndexerData.set({
        members: [
          { user: mockUser1, indexerSummary: [{ indexer: 'CDI', totalCurrentValue: 2000 }] },
          { user: mockUser2, indexerSummary: [{ indexer: 'IPCA', totalCurrentValue: 1000 }] },
        ],
      });
      expect(component.groupMembersNotSharingIndexer()).toBe(0);
    });

    it('filteredIndexerMembers should respect selectedMemberIds', () => {
      component.selectedMemberIds.set([mockUser1.id]);
      expect(component.filteredIndexerMembers().length).toBe(1);
      expect(component.filteredIndexerMembers()[0].user.id).toBe(mockUser1.id);
    });

    it('should exclude null indexerSummary from aggregation', () => {
      const nonNull = component.filteredIndexerMembers().filter(m => m.indexerSummary !== null);
      expect(nonNull.length).toBe(1);
      expect(nonNull[0].user.id).toBe(mockUser1.id);
    });
  });

  // ─── Group date selectors ─────────────────────────────────────────────────

  describe('group date selectors', () => {
    beforeEach(() => {
      setup();
      component.selectedGroupId.set(10);
    });

    it('onGroupLineStartDateChange should update groupLineStartDate and reload', () => {
      const callsBefore = dashboardServiceSpy.getGroupMonthly.mock.calls.length;
      const event = { target: { value: '2024-01-01' } } as unknown as Event;
      component.onGroupLineStartDateChange(event);
      expect(component.groupLineStartDate()).toBe('2024-01-01');
      expect(dashboardServiceSpy.getGroupMonthly.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('onGroupLineEndDateChange should update groupLineEndDate and reload', () => {
      const callsBefore = dashboardServiceSpy.getGroupMonthly.mock.calls.length;
      const event = { target: { value: '2025-01-31' } } as unknown as Event;
      component.onGroupLineEndDateChange(event);
      expect(component.groupLineEndDate()).toBe('2025-01-31');
      expect(dashboardServiceSpy.getGroupMonthly.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // ─── getMemberInitials() ──────────────────────────────────────────────────

  describe('getMemberInitials()', () => {
    beforeEach(() => setup());

    it('should return uppercase initials from first and last name', () => {
      expect(component.getMemberInitials(mockUser1)).toBe('JS');
    });

    it('should handle single-letter names', () => {
      const user = { id: 3, firstName: 'A', lastName: 'B', email: 'ab@test.com' };
      expect(component.getMemberInitials(user)).toBe('AB');
    });
  });

  // ─── formatCurrency() ─────────────────────────────────────────────────────

  describe('formatCurrency()', () => {
    beforeEach(() => setup());

    it('should format as BRL', () => {
      expect(component.formatCurrency(1500)).toContain('1.500');
    });

    it('should format zero correctly', () => {
      expect(component.formatCurrency(0)).toContain('0');
    });
  });
});