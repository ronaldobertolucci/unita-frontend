import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ViewChild, ElementRef, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement,
  LineController, BarController,
  PieController, ArcElement,
  Title, Tooltip, Legend, Filler,
  ChartConfiguration,
} from 'chart.js';
import {
  DashboardService,
  DashboardDto,
  MonthlyDataDto,
  DashboardCategorySummaryDto,
  GroupDashboardDto,
  GroupMonthlyResponseDto,
  GroupCategorySummaryResponseDto,
  GroupIssuerRiskResponseDto,
  GroupIndexerSummaryResponseDto,
  IssuerRiskDto,
  IndexerSummaryDto,
  CategoryAmountDto,
  UserDto,
  LiquiditySummaryDto,
  GroupLiquiditySummaryResponseDto,
  GroupMemberLiquiditySummaryDto,
  GroupMemberNetProfitDto,
  GroupNetProfitResponseDto,
} from '../../core/services/dashboard.service';
import { GroupService } from '../../core/services/group.service';
import { normalizeType } from '../../core/utils/pocket.utils';
import { translateApiError } from '../../core/utils/api-error.util';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement,
  LineController, BarController,
  PieController, ArcElement,
  Title, Tooltip, Legend, Filler,
  ChartDataLabels,
);

type DashboardTab     = 'individual' | 'groups';
type DashboardSection = 'summary' | 'income-expense' | 'investments';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly groupService     = inject(GroupService);

  // ── Tabs & Sections ───────────────────────────────────────────────
  readonly activeTab         = signal<DashboardTab>('individual');
  readonly individualSection = signal<DashboardSection>('summary');
  readonly groupSection      = signal<DashboardSection>('summary');

  setTab(tab: DashboardTab): void {
    this.activeTab.set(tab);
  }

  setIndividualSection(section: DashboardSection): void {
    this.individualSection.set(section);
    if (section === 'investments') {
      setTimeout(() => {
        this.renderIssuerRiskChart();
        this.renderIndexerChart();
        this.renderLiquidityChart();
      }, 0);
    }
  }

  setGroupSection(section: DashboardSection): void {
    this.groupSection.set(section);
    if (section === 'investments') {
      setTimeout(() => {
        this.renderGroupIssuerRiskChart();
        this.renderGroupIndexerChart();
        this.renderGroupLiquidityChart();
      }, 0);
    }
  }

  // ── Shared helpers ────────────────────────────────────────────────
  readonly monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  readonly availableYears = computed(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => y - i);
  });

  private static previousMonth(): { month: number; year: number } {
    const now   = new Date();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return { month, year };
  }

  private static defaultLineRange(): { start: string; end: string } {
    const end   = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    return { start: DashboardComponent.toIsoDate(start), end: DashboardComponent.toIsoDate(end) };
  }

  private static toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── Label maps ────────────────────────────────────────────────────
  private readonly pocketLabelMap: Record<string, string> = {
    BANK_ACCOUNT:          'Conta Bancária',
    BENEFIT_ACCOUNT:       'Conta de Benefício',
    FGTS_EMPLOYER_ACCOUNT: 'FGTS',
    CASH:                  'Carteira',
  };

  private readonly investmentLabelMap: Record<string, string> = {
    RENDA_FIXA:  'Renda Fixa',
    PREVIDENCIA: 'Previdência',
  };

  private readonly investmentSortOrder: Record<string, number> = {
    RENDA_FIXA:  0,
    PREVIDENCIA: 1,
  };

  private readonly pieColors = [
    '#19e5a8', '#a78bfa', '#ff6b6b', '#fbbf24',
    '#60a5fa', '#f472b6', '#34d399', '#fb923c',
  ];

  readonly liquidityTypeLabels: Record<string, string> = {
    DIARIA:         'Diária',
    MERCADO:        'Mercado secundário',
    NO_VENCIMENTO:  'No vencimento',
    PRAZO_FIXO:     'Prazo fixo',
    PREVIDENCIARIA: 'Previdenciária',
  };

  // ════════════════════════════════════════════════════════════════════
  // INDIVIDUAL TAB
  // ════════════════════════════════════════════════════════════════════

  readonly isLoadingDashboard  = signal(false);
  readonly isLoadingMonthly    = signal(false);
  readonly isLoadingCategory   = signal(false);
  readonly isLoadingIssuerRisk = signal(false);
  readonly isLoadingIndexer    = signal(false);
  readonly isLoadingLiquidity = signal(false);
  readonly isLoadingNetProfit = signal(false);
  readonly errorMessage        = signal<string | null>(null);

  readonly dashboardData  = signal<DashboardDto | null>(null);
  readonly monthlyData    = signal<MonthlyDataDto[]>([]);
  readonly categoryData   = signal<DashboardCategorySummaryDto | null>(null);
  readonly issuerRiskData = signal<IssuerRiskDto[]>([]);
  readonly indexerData    = signal<IndexerSummaryDto[]>([]);
  readonly liquidityData      = signal<LiquiditySummaryDto[]>([]);
  readonly netProfitData      = signal<number | null>(null);

  readonly lineStartDate = signal<string>(DashboardComponent.defaultLineRange().start);
  readonly lineEndDate   = signal<string>(DashboardComponent.defaultLineRange().end);
  readonly categoryStartDate = signal<string>(DashboardComponent.defaultLineRange().start);
  readonly categoryEndDate   = signal<string>(DashboardComponent.defaultLineRange().end);

  readonly pocketRows = computed(() =>
    (this.dashboardData()?.pockets ?? []).map(p => ({
      label: this.pocketLabelMap[normalizeType(p.category)] ?? p.category,
      total: p.total,
    }))
  );

  readonly pocketTotal = computed(() =>
    this.pocketRows().reduce((sum, r) => sum + r.total, 0)
  );

  readonly investmentRows = computed(() =>
    (this.dashboardData()?.investments ?? [])
      .slice()
      .sort((a, b) => (this.investmentSortOrder[a.category] ?? 99) - (this.investmentSortOrder[b.category] ?? 99))
      .map(i => ({
        label: this.investmentLabelMap[i.category] ?? i.category,
        total: i.total,
      }))
  );

  readonly investmentTotal = computed(() =>
    this.investmentRows().reduce((sum, r) => sum + r.total, 0)
  );

  readonly hasMonthlyData  = computed(() => this.monthlyData().length > 0);
  readonly hasExpenseData  = computed(() => (this.categoryData()?.expenses.length ?? 0) > 0);
  readonly hasIncomeData   = computed(() => (this.categoryData()?.incomes.length  ?? 0) > 0);
  readonly hasIssuerRiskData = computed(() => this.issuerRiskData().length > 0);
  readonly hasIndexerData    = computed(() => this.indexerData().length > 0);
  readonly hasLiquidityData   = computed(() => this.liquidityData().length > 0);

  // Individual canvas refs
  @ViewChild('lineChartCanvas')    lineChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('expenseChartCanvas') expenseChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('incomeChartCanvas')  incomeChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('issuerRiskCanvas')   issuerRiskCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('indexerCanvas')      indexerCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('liquidityCanvas')      liquidityCanvas!: ElementRef<HTMLCanvasElement>;

  private lineChart: Chart | null       = null;
  private expenseChart: Chart | null    = null;
  private incomeChart: Chart | null     = null;
  private issuerRiskChart: Chart | null = null;
  private indexerChart: Chart | null    = null;
  private liquidityChart: Chart | null      = null;

  // ════════════════════════════════════════════════════════════════════
  // GROUP TAB
  // ════════════════════════════════════════════════════════════════════

  readonly groups = this.groupService.myGroups;

  readonly selectedGroupId   = signal<number | null>(null);
  readonly selectedMemberIds = signal<number[]>([]);

  readonly isLoadingGroupDashboard    = signal(false);
  readonly isLoadingGroupMonthly      = signal(false);
  readonly isLoadingGroupCategory     = signal(false);
  readonly isLoadingGroupIssuerRisk   = signal(false);
  readonly isLoadingGroupIndexer      = signal(false);
  readonly isLoadingGroupLiquidity = signal(false);
  readonly isLoadingGroupNetProfit = signal(false);
  readonly groupErrorMessage          = signal<string | null>(null);

  readonly groupDashboardData  = signal<GroupDashboardDto | null>(null);
  readonly groupMonthlyData    = signal<GroupMonthlyResponseDto | null>(null);
  readonly groupCategoryData   = signal<GroupCategorySummaryResponseDto | null>(null);
  readonly groupIssuerRiskData = signal<GroupIssuerRiskResponseDto | null>(null);
  readonly groupIndexerData    = signal<GroupIndexerSummaryResponseDto | null>(null);
  readonly groupLiquidityData      = signal<GroupLiquiditySummaryResponseDto | null>(null);
  readonly groupNetProfitData      = signal<GroupNetProfitResponseDto | null>(null);

  readonly groupLineStartDate = signal<string>(DashboardComponent.defaultLineRange().start);
  readonly groupLineEndDate   = signal<string>(DashboardComponent.defaultLineRange().end);
  readonly groupCategoryStartDate = signal<string>(DashboardComponent.defaultLineRange().start);
  readonly groupCategoryEndDate   = signal<string>(DashboardComponent.defaultLineRange().end);

  readonly groupMembers = computed<UserDto[]>(() =>
    this.groupDashboardData()?.members.map(m => m.user) ?? []
  );

  readonly isAllMembersSelected = computed(() =>
    this.selectedMemberIds().length === this.groupMembers().length
  );

  readonly filteredDashboardMembers = computed(() => {
    const data = this.groupDashboardData();
    const ids  = this.selectedMemberIds();
    if (!data) return [];
    return data.members.filter(m => ids.includes(m.user.id));
  });

  readonly filteredMonthlyMembers = computed(() => {
    const data = this.groupMonthlyData();
    const ids  = this.selectedMemberIds();
    if (!data) return [];
    return data.members.filter(m => ids.includes(m.user.id));
  });

  readonly filteredCategoryMembers = computed(() => {
    const data = this.groupCategoryData();
    const ids  = this.selectedMemberIds();
    if (!data) return [];
    return data.members.filter(m => ids.includes(m.user.id));
  });

  readonly filteredIssuerRiskMembers = computed(() => {
    const data = this.groupIssuerRiskData();
    const ids  = this.selectedMemberIds();
    if (!data) return [];
    return data.members.filter(m => ids.includes(m.user.id));
  });

  readonly filteredIndexerMembers = computed(() => {
    const data = this.groupIndexerData();
    const ids  = this.selectedMemberIds();
    if (!data) return [];
    return data.members.filter(m => ids.includes(m.user.id));
  });

  // Aggregated group data
  readonly groupPocketRows = computed(() => {
    const totals = new Map<string, number>();
    for (const m of this.filteredDashboardMembers()) {
      if (m.pockets === null) continue;
      for (const p of m.pockets) {
        const label = this.pocketLabelMap[normalizeType(p.category)] ?? p.category;
        totals.set(label, (totals.get(label) ?? 0) + p.total);
      }
    }
    return Array.from(totals.entries()).map(([label, total]) => ({ label, total }));
  });

  readonly groupPocketTotal = computed(() =>
    this.groupPocketRows().reduce((sum, r) => sum + r.total, 0)
  );

  readonly groupInvestmentRows = computed(() => {
    const totals = new Map<string, number>();
    for (const m of this.filteredDashboardMembers()) {
      if (m.investments === null) continue;
      for (const i of m.investments) {
        const label = this.investmentLabelMap[i.category] ?? i.category;
        totals.set(label, (totals.get(label) ?? 0) + i.total);
      }
    }
    const order = Object.values(this.investmentLabelMap);
    return Array.from(totals.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => (order.indexOf(a.label) ?? 99) - (order.indexOf(b.label) ?? 99));
  });

  readonly groupInvestmentTotal = computed(() =>
    this.groupInvestmentRows().reduce((sum, r) => sum + r.total, 0)
  );

  readonly groupTotalOpenBills = computed(() =>
    this.filteredDashboardMembers().reduce((sum, m) => sum + (m.totalOpenBills ?? 0), 0)
  );

  readonly groupMembersNotSharingPockets = computed(() =>
    this.filteredDashboardMembers().filter(m => m.pockets === null).length
  );

  readonly groupMembersNotSharingInvestments = computed(() =>
    this.filteredDashboardMembers().filter(m => m.investments === null).length
  );

  readonly groupMembersNotSharingBills = computed(() =>
    this.filteredDashboardMembers().filter(m => m.totalOpenBills === null).length
  );

  readonly groupMembersNotSharingMonthly = computed(() =>
    this.filteredMonthlyMembers().filter(m => m.monthly === null).length
  );

  readonly groupMembersNotSharingCategory = computed(() =>
    this.filteredCategoryMembers().filter(m => m.incomes === null || m.expenses === null).length
  );

  readonly groupMembersNotSharingIssuerRisk = computed(() =>
    this.filteredIssuerRiskMembers().filter(m => m.issuerRisk === null).length
  );

  readonly groupMembersNotSharingIndexer = computed(() =>
    this.filteredIndexerMembers().filter(m => m.indexerSummary === null).length
  );

  readonly groupHasMonthlyData  = computed(() =>
    this.filteredMonthlyMembers().some(m => (m.monthly?.length ?? 0) > 0)
  );

  readonly groupHasExpenseData  = computed(() =>
    this.filteredCategoryMembers().some(m => (m.expenses?.length ?? 0) > 0)
  );

  readonly groupHasIncomeData   = computed(() =>
    this.filteredCategoryMembers().some(m => (m.incomes?.length ?? 0) > 0)
  );

  readonly groupHasIssuerRiskData = computed(() =>
    this.filteredIssuerRiskMembers().some(m => (m.issuerRisk?.length ?? 0) > 0)
  );

  readonly groupHasIndexerData = computed(() =>
    this.filteredIndexerMembers().some(m => (m.indexerSummary?.length ?? 0) > 0)
  );

  readonly filteredLiquidityMembers = computed(() => {
    const data = this.groupLiquidityData();
    const ids  = this.selectedMemberIds();
    if (!data) return [];
    return data.members.filter(m => ids.includes(m.user.id));
  });

  readonly groupHasLiquidityData = computed(() =>
    this.filteredLiquidityMembers().some(m => (m.liquidityTypeSummary?.length ?? 0) > 0)
  );

  readonly groupMembersNotSharingLiquidity = computed(() =>
    this.filteredLiquidityMembers().filter(m => m.liquidityTypeSummary === null).length
  );

  readonly groupNetProfit = computed(() => {
    const data = this.groupNetProfitData();
    const ids  = this.selectedMemberIds();
    if (!data) return null;
    return data.members
      .filter(m => ids.includes(m.user.id))
      .reduce((sum, m) => sum + (m.netProfit ?? 0), 0);
  });

  readonly groupMembersNotSharingNetProfit = computed(() => {
    const data = this.groupNetProfitData();
    const ids  = this.selectedMemberIds();
    if (!data) return 0;
    return data.members.filter(m => ids.includes(m.user.id) && m.netProfit === null).length;
  });

  // Group canvas refs
  @ViewChild('groupLineChartCanvas')    groupLineChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupExpenseChartCanvas') groupExpenseChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupIncomeChartCanvas')  groupIncomeChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupIssuerRiskCanvas')   groupIssuerRiskCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupIndexerCanvas')      groupIndexerCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupLiquidityCanvas')    groupLiquidityCanvas!: ElementRef<HTMLCanvasElement>;

  private groupLineChart: Chart | null       = null;
  private groupExpenseChart: Chart | null    = null;
  private groupIncomeChart: Chart | null     = null;
  private groupIssuerRiskChart: Chart | null = null;
  private groupIndexerChart: Chart | null    = null;
  private groupLiquidityChart: Chart | null = null;

  // ── Effects ───────────────────────────────────────────────────────
  constructor() {
    effect(() => {
      this.filteredMonthlyMembers();
      this.renderGroupLineChart();
    });

    effect(() => {
      this.filteredCategoryMembers();
      this.renderGroupBarCharts();
    });

    effect(() => {
      this.filteredIssuerRiskMembers();
      this.renderGroupIssuerRiskChart();
    });

    effect(() => {
      this.filteredIndexerMembers();
      this.renderGroupIndexerChart();
    });

    effect(() => {
      this.filteredLiquidityMembers();
      this.renderGroupLiquidityChart();
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnInit(): void {
    this.groupService.loadMyGroups$().subscribe();
    this.loadDashboard();
    this.loadMonthly();
    this.loadCategoryData();
    this.loadIssuerRisk();
    this.loadIndexerSummary();
    this.loadLiquiditySummary();
    this.loadNetProfit();
  }

  ngOnDestroy(): void {
    this.lineChart?.destroy();
    this.expenseChart?.destroy();
    this.incomeChart?.destroy();
    this.issuerRiskChart?.destroy();
    this.indexerChart?.destroy();
    this.groupLineChart?.destroy();
    this.groupExpenseChart?.destroy();
    this.groupIncomeChart?.destroy();
    this.groupIssuerRiskChart?.destroy();
    this.groupIndexerChart?.destroy();
    this.liquidityChart?.destroy();
    this.groupLiquidityChart?.destroy();
  }

  // ════════════════════════════════════════════════════════════════════
  // INDIVIDUAL — Data loading & actions
  // ════════════════════════════════════════════════════════════════════

  private loadDashboard(): void {
    this.isLoadingDashboard.set(true);
    this.dashboardService.getDashboard().subscribe({
      next: data => {
        this.dashboardData.set(data);
        this.isLoadingDashboard.set(false);
      },
      error: err => {
        this.errorMessage.set(translateApiError(err?.error?.message));
        this.isLoadingDashboard.set(false);
      },
    });
  }

  loadMonthly(): void {
    this.isLoadingMonthly.set(true);
    this.dashboardService.getMonthly(this.lineStartDate(), this.lineEndDate()).subscribe({
      next: data => {
        this.monthlyData.set(data);
        this.isLoadingMonthly.set(false);
        this.renderLineChart();
      },
      error: () => this.isLoadingMonthly.set(false),
    });
  }

  loadCategoryData(): void {
    this.isLoadingCategory.set(true);
    this.dashboardService.getCategorySummary(this.categoryStartDate(), this.categoryEndDate()).subscribe({
      next: data => {
        this.categoryData.set(data);
        this.isLoadingCategory.set(false);
        this.renderBarCharts();
      },
      error: () => this.isLoadingCategory.set(false),
    });
  }

  private loadIssuerRisk(): void {
    this.isLoadingIssuerRisk.set(true);
    this.dashboardService.getIssuerRisk().subscribe({
      next: data => {
        this.issuerRiskData.set(data);
        this.isLoadingIssuerRisk.set(false);
        this.renderIssuerRiskChart();
      },
      error: () => this.isLoadingIssuerRisk.set(false),
    });
  }

  private loadIndexerSummary(): void {
    this.isLoadingIndexer.set(true);
    this.dashboardService.getIndexerSummary().subscribe({
      next: data => {
        this.indexerData.set(data);
        this.isLoadingIndexer.set(false);
        this.renderIndexerChart();
      },
      error: () => this.isLoadingIndexer.set(false),
    });
  }

  private loadLiquiditySummary(): void {
    this.isLoadingLiquidity.set(true);
    this.dashboardService.getLiquiditySummary().subscribe({
      next: data => {
        this.liquidityData.set(data);
        this.isLoadingLiquidity.set(false);
        this.renderLiquidityChart();
      },
      error: () => this.isLoadingLiquidity.set(false),
    });
  }

  private loadNetProfit(): void {
    this.isLoadingNetProfit.set(true);
    this.dashboardService.getNetProfit().subscribe({
      next: data => {
        this.netProfitData.set(data);
        this.isLoadingNetProfit.set(false);
      },
      error: () => this.isLoadingNetProfit.set(false),
    });
  }

  onLineStartDateChange(event: Event): void {
    this.lineStartDate.set((event.target as HTMLInputElement).value);
    this.loadMonthly();
  }

  onLineEndDateChange(event: Event): void {
    this.lineEndDate.set((event.target as HTMLInputElement).value);
    this.loadMonthly();
  }

  onCategoryStartDateChange(event: Event): void {
    this.categoryStartDate.set((event.target as HTMLInputElement).value);
    this.loadCategoryData();
  }

  onCategoryEndDateChange(event: Event): void {
    this.categoryEndDate.set((event.target as HTMLInputElement).value);
    this.loadCategoryData();
  }


  // ════════════════════════════════════════════════════════════════════
  // GROUP — Data loading & actions
  // ════════════════════════════════════════════════════════════════════

  onGroupSelect(event: Event): void {
    const groupId = Number((event.target as HTMLSelectElement).value);
    this.selectedGroupId.set(groupId);

    const prev  = DashboardComponent.previousMonth();
    const range = DashboardComponent.defaultLineRange();
    this.groupCategoryStartDate.set(range.start);
    this.groupCategoryEndDate.set(range.end);
    this.groupLineStartDate.set(range.start);
    this.groupLineEndDate.set(range.end);
    this.selectedMemberIds.set([]);
    this.groupDashboardData.set(null);
    this.groupMonthlyData.set(null);
    this.groupCategoryData.set(null);
    this.groupIssuerRiskData.set(null);
    this.groupIndexerData.set(null);
    this.groupLiquidityData.set(null);
    this.groupNetProfitData.set(null);
    this.groupErrorMessage.set(null);

    this.loadGroupDashboard(groupId);
    this.loadGroupMonthly(groupId);
    this.loadGroupCategoryData(groupId);
    this.loadGroupIssuerRisk(groupId);
    this.loadGroupIndexerSummary(groupId);
    this.loadGroupLiquiditySummary(groupId);
    this.loadGroupNetProfit(groupId);
  }

  toggleMember(id: number): void {
    const current = this.selectedMemberIds();
    if (current.includes(id)) {
      if (current.length === 1) return;
      this.selectedMemberIds.set(current.filter(i => i !== id));
    } else {
      this.selectedMemberIds.set([...current, id]);
    }
  }

  selectAllMembers(): void {
    this.selectedMemberIds.set(this.groupMembers().map(m => m.id));
  }

  isMemberSelected(id: number): boolean {
    return this.selectedMemberIds().includes(id);
  }

  onGroupLineStartDateChange(event: Event): void {
    this.groupLineStartDate.set((event.target as HTMLInputElement).value);
    const groupId = this.selectedGroupId();
    if (groupId) this.loadGroupMonthly(groupId);
  }

  onGroupLineEndDateChange(event: Event): void {
    this.groupLineEndDate.set((event.target as HTMLInputElement).value);
    const groupId = this.selectedGroupId();
    if (groupId) this.loadGroupMonthly(groupId);
  }

  onGroupCategoryStartDateChange(event: Event): void {
    this.groupCategoryStartDate.set((event.target as HTMLInputElement).value);
    const groupId = this.selectedGroupId();
    if (groupId) this.loadGroupCategoryData(groupId);
  }

  onGroupCategoryEndDateChange(event: Event): void {
    this.groupCategoryEndDate.set((event.target as HTMLInputElement).value);
    const groupId = this.selectedGroupId();
    if (groupId) this.loadGroupCategoryData(groupId);
  }

  private loadGroupDashboard(groupId: number): void {
    this.isLoadingGroupDashboard.set(true);
    this.dashboardService.getGroupDashboard(groupId).subscribe({
      next: data => {
        this.groupDashboardData.set(data);
        this.selectedMemberIds.set(data.members.map(m => m.user.id));
        this.isLoadingGroupDashboard.set(false);
      },
      error: err => {
        this.groupErrorMessage.set(translateApiError(err?.error?.message));
        this.isLoadingGroupDashboard.set(false);
      },
    });
  }

  loadGroupMonthly(groupId: number): void {
    this.isLoadingGroupMonthly.set(true);
    this.dashboardService.getGroupMonthly(groupId, this.groupLineStartDate(), this.groupLineEndDate()).subscribe({
      next: data => {
        this.groupMonthlyData.set(data);
        this.isLoadingGroupMonthly.set(false);
      },
      error: () => this.isLoadingGroupMonthly.set(false),
    });
  }

  loadGroupCategoryData(groupId: number): void {
    this.isLoadingGroupCategory.set(true);
    this.dashboardService.getGroupCategorySummary(groupId, this.groupCategoryStartDate(), this.groupCategoryEndDate()).subscribe({
      next: data => {
        this.groupCategoryData.set(data);
        this.isLoadingGroupCategory.set(false);
      },
      error: () => this.isLoadingGroupCategory.set(false),
    });
  }

  private loadGroupIssuerRisk(groupId: number): void {
    this.isLoadingGroupIssuerRisk.set(true);
    this.dashboardService.getGroupIssuerRisk(groupId).subscribe({
      next: data => {
        this.groupIssuerRiskData.set(data);
        this.isLoadingGroupIssuerRisk.set(false);
      },
      error: () => this.isLoadingGroupIssuerRisk.set(false),
    });
  }

  private loadGroupIndexerSummary(groupId: number): void {
    this.isLoadingGroupIndexer.set(true);
    this.dashboardService.getGroupIndexerSummary(groupId).subscribe({
      next: data => {
        this.groupIndexerData.set(data);
        this.isLoadingGroupIndexer.set(false);
      },
      error: () => this.isLoadingGroupIndexer.set(false),
    });
  }

  private loadGroupLiquiditySummary(groupId: number): void {
    this.isLoadingGroupLiquidity.set(true);
    this.dashboardService.getGroupLiquiditySummary(groupId).subscribe({
      next: data => {
        this.groupLiquidityData.set(data);
        this.isLoadingGroupLiquidity.set(false);
      },
      error: () => this.isLoadingGroupLiquidity.set(false),
    });
  }

  private loadGroupNetProfit(groupId: number): void {
    this.isLoadingGroupNetProfit.set(true);
    this.dashboardService.getGroupNetProfit(groupId).subscribe({
      next: data => {
        this.groupNetProfitData.set(data);
        this.isLoadingGroupNetProfit.set(false);
      },
      error: () => this.isLoadingGroupNetProfit.set(false),
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // CHART RENDERING
  // ════════════════════════════════════════════════════════════════════

  private renderLineChart(): void {
    const canvas = this.lineChartCanvas?.nativeElement;
    if (!canvas) return;

    const months      = this.generateMonthsBetween(this.lineStartDate(), this.lineEndDate());
    const dataMap     = new Map(this.monthlyData().map(d => [d.month, d]));
    const incomeData  = months.map(m => dataMap.get(m)?.totalIncome  ?? 0);
    const expenseData = months.map(m => dataMap.get(m)?.totalExpense ?? 0);
    const balanceData = months.map((_, i) => (incomeData[i] ?? 0) - (expenseData[i] ?? 0));
    const labels      = months.map(m => this.formatMonthLabel(m));

    this.lineChart?.destroy();
    this.lineChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [this.incomeDataset(incomeData), this.expenseDataset(expenseData), this.balanceDataset(balanceData)] },
      options: this.lineChartOptions(),
    });
  }

  private renderBarCharts(): void {
    const data = this.categoryData();

    const expenses = [...(data?.expenses ?? [])].sort((a, b) => b.total - a.total);
    const incomes  = [...(data?.incomes  ?? [])].sort((a, b) => b.total - a.total);

    const expenseCanvas = this.expenseChartCanvas?.nativeElement;
    if (expenseCanvas) {
      this.setBarContainerHeight(expenseCanvas, expenses.length);
      this.expenseChart?.destroy();
      this.expenseChart = expenses.length > 0
        ? new Chart(expenseCanvas, { type: 'bar', data: this.buildBarData(expenses, 'expense'), options: this.barChartOptions() })
        : null;
    }

    const incomeCanvas = this.incomeChartCanvas?.nativeElement;
    if (incomeCanvas) {
      this.setBarContainerHeight(incomeCanvas, incomes.length);
      this.incomeChart?.destroy();
      this.incomeChart = incomes.length > 0
        ? new Chart(incomeCanvas, { type: 'bar', data: this.buildBarData(incomes, 'income'), options: this.barChartOptions() })
        : null;
    }
  }

  private renderIssuerRiskChart(): void {
    const canvas = this.issuerRiskCanvas?.nativeElement;
    if (!canvas) return;

    const sorted = [...this.issuerRiskData()].sort((a, b) => b.totalCurrentValue - a.totalCurrentValue);

    this.issuerRiskChart?.destroy();
    this.issuerRiskChart = sorted.length > 0
      ? new Chart(canvas, {
          type: 'bar',
          data: this.buildIssuerBarData(sorted),
          options: this.barChartOptions(),
        })
      : null;
  }

  private renderIndexerChart(): void {
    const canvas = this.indexerCanvas?.nativeElement;
    if (!canvas) return;

    this.indexerChart?.destroy();
    this.indexerChart = this.indexerData().length > 0
      ? new Chart(canvas, {
          type: 'pie',
          data: this.buildPieData(this.indexerData()),
          options: this.pieChartOptions(),
        })
      : null;
  }

  private renderGroupLineChart(): void {
    const canvas = this.groupLineChartCanvas?.nativeElement;
    if (!canvas) return;

    const months      = this.generateMonthsBetween(this.groupLineStartDate(), this.groupLineEndDate());
    const merged      = this.aggregateMonthly(this.filteredMonthlyMembers());
    const dataMap     = new Map(merged.map(d => [d.month, d]));
    const incomeData  = months.map(m => dataMap.get(m)?.totalIncome  ?? 0);
    const expenseData = months.map(m => dataMap.get(m)?.totalExpense ?? 0);
    const balanceData = months.map((_, i) => (incomeData[i] ?? 0) - (expenseData[i] ?? 0));
    const labels      = months.map(m => this.formatMonthLabel(m));

    this.groupLineChart?.destroy();
    this.groupLineChart = this.groupHasMonthlyData()
      ? new Chart(canvas, {
          type: 'line',
          data: { labels, datasets: [this.incomeDataset(incomeData), this.expenseDataset(expenseData), this.balanceDataset(balanceData)] },
          options: this.lineChartOptions(),
        })
      : null;
  }

  private renderGroupBarCharts(): void {
    const members  = this.filteredCategoryMembers();
    const expenses = this.aggregateCategories(members, 'expenses').sort((a, b) => b.total - a.total);
    const incomes  = this.aggregateCategories(members, 'incomes' ).sort((a, b) => b.total - a.total);

    const expenseCanvas = this.groupExpenseChartCanvas?.nativeElement;
    if (expenseCanvas) {
      this.setBarContainerHeight(expenseCanvas, expenses.length);
      this.groupExpenseChart?.destroy();
      this.groupExpenseChart = expenses.length > 0
        ? new Chart(expenseCanvas, { type: 'bar', data: this.buildBarData(expenses, 'expense'), options: this.barChartOptions() })
        : null;
    }

    const incomeCanvas = this.groupIncomeChartCanvas?.nativeElement;
    if (incomeCanvas) {
      this.setBarContainerHeight(incomeCanvas, incomes.length);
      this.groupIncomeChart?.destroy();
      this.groupIncomeChart = incomes.length > 0
        ? new Chart(incomeCanvas, { type: 'bar', data: this.buildBarData(incomes, 'income'), options: this.barChartOptions() })
        : null;
    }
  }

  private renderGroupIssuerRiskChart(): void {
    const canvas = this.groupIssuerRiskCanvas?.nativeElement;
    if (!canvas) return;

    const aggregated = this.aggregateIssuerRisk(this.filteredIssuerRiskMembers());
    const sorted     = aggregated.sort((a, b) => b.totalCurrentValue - a.totalCurrentValue);

    this.groupIssuerRiskChart?.destroy();
    this.groupIssuerRiskChart = sorted.length > 0
      ? new Chart(canvas, {
          type: 'bar',
          data: this.buildIssuerBarData(sorted),
          options: this.barChartOptions(),
        })
      : null;
  }

  private renderGroupIndexerChart(): void {
    const canvas = this.groupIndexerCanvas?.nativeElement;
    if (!canvas) return;

    const aggregated = this.aggregateIndexerSummary(this.filteredIndexerMembers());

    this.groupIndexerChart?.destroy();
    this.groupIndexerChart = aggregated.length > 0
      ? new Chart(canvas, {
          type: 'pie',
          data: this.buildPieData(aggregated),
          options: this.pieChartOptions(),
        })
      : null;
  }

  private renderLiquidityChart(): void {
    const canvas = this.liquidityCanvas?.nativeElement;
    if (!canvas) return;

    this.liquidityChart?.destroy();
    this.liquidityChart = this.liquidityData().length > 0
      ? new Chart(canvas, {
          type: 'pie',
          data: this.buildLiquidityPieData(this.liquidityData()),
          options: this.pieChartOptions(),
        })
      : null;
  }

  private renderGroupLiquidityChart(): void {
    const canvas = this.groupLiquidityCanvas?.nativeElement;
    if (!canvas) return;

    const aggregated = this.aggregateLiquiditySummary(this.filteredLiquidityMembers());

    this.groupLiquidityChart?.destroy();
    this.groupLiquidityChart = aggregated.length > 0
      ? new Chart(canvas, {
          type: 'pie',
          data: this.buildLiquidityPieData(aggregated),
          options: this.pieChartOptions(),
        })
      : null;
  }

  // ── Dataset builders ──────────────────────────────────────────────
  private incomeDataset(data: number[]): ChartConfiguration['data']['datasets'][0] {
    return {
      label: 'Receitas', data,
      borderColor: '#19e5a8', backgroundColor: 'rgba(25, 229, 168, 0.08)',
      fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#19e5a8', borderWidth: 2,
    };
  }

  private expenseDataset(data: number[]): ChartConfiguration['data']['datasets'][0] {
    return {
      label: 'Despesas', data,
      borderColor: '#ff6b6b', backgroundColor: 'rgba(255, 107, 107, 0.08)',
      fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#ff6b6b', borderWidth: 2,
    };
  }

  private balanceDataset(data: number[]): ChartConfiguration['data']['datasets'][0] {
    return {
      label: 'Saldo', data,
      borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.06)',
      fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#a78bfa', borderWidth: 2,
      borderDash: [4, 3],
    };
  }

  private buildBarData(
    items: { category: string; total: number }[],
    type: 'income' | 'expense'
  ): ChartConfiguration['data'] {
    const color = type === 'expense' ? '#ff6b6b' : '#19e5a8';
    const bg    = type === 'expense' ? 'rgba(255, 107, 107, 0.65)' : 'rgba(25, 229, 168, 0.65)';
    return {
      labels: items.map(i => this.truncateLabel(i.category)),
      datasets: [{ data: items.map(i => i.total), backgroundColor: bg, borderColor: color, borderWidth: 1, borderRadius: 4 }],
    };
  }

  private buildIssuerBarData(items: IssuerRiskDto[]): ChartConfiguration['data'] {
    return {
      labels: items.map(i => this.truncateLabel(i.legalEntityName)),
      datasets: [{
        data: items.map(i => i.totalCurrentValue),
        backgroundColor: 'rgba(96, 165, 250, 0.65)',
        borderColor: '#60a5fa',
        borderWidth: 1,
        borderRadius: 4,
      }],
    };
  }

  private buildPieData(items: IndexerSummaryDto[]): ChartConfiguration['data'] {
    return {
      labels: items.map(i => i.indexer),
      datasets: [{
        data: items.map(i => i.totalCurrentValue),
        backgroundColor: items.map((_, idx) => this.pieColors[idx % this.pieColors.length] + 'cc'),
        borderColor:     items.map((_, idx) => this.pieColors[idx % this.pieColors.length]),
        borderWidth: 2,
      }],
    };
  }

  private buildLiquidityPieData(items: LiquiditySummaryDto[]): ChartConfiguration['data'] {
    return {
      labels: items.map(i => this.liquidityTypeLabels[i.liquidityType] ?? i.liquidityType),
      datasets: [{
        data: items.map(i => i.totalCurrentValue),
        backgroundColor: items.map((_, idx) => this.pieColors[idx % this.pieColors.length] + 'cc'),
        borderColor:     items.map((_, idx) => this.pieColors[idx % this.pieColors.length]),
        borderWidth: 2,
      }],
    };
  }

  // ── Chart options ─────────────────────────────────────────────────
  private lineChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#6b87a6', font: { family: 'DM Sans', size: 12 }, boxWidth: 12, padding: 16 } },
        tooltip: {
          backgroundColor: 'rgba(10, 18, 40, 0.95)', borderColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
          titleColor: '#dce9f8', bodyColor: '#6b87a6', padding: 10,
          callbacks: { label: ctx => ` ${this.formatCurrency(ctx.parsed.y ?? 0)}` },
        },
        datalabels: { display: false },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b87a6', font: { family: 'DM Sans', size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b87a6', font: { family: 'DM Sans', size: 11 }, callback: val => this.formatCurrencyShort(Number(val)) } },
      },
    };
  }

  private barChartOptions(): ChartConfiguration['options'] {
    return {
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 72 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 18, 40, 0.95)', borderColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
          titleColor: '#dce9f8', bodyColor: '#6b87a6', padding: 10,
          callbacks: { label: ctx => ` ${this.formatCurrency(ctx.parsed.x ?? 0)}` },
        },
        datalabels: {
          anchor: 'end',
          align: 'end',
          clamp: true,
          color: '#dce9f8',
          font: () => ({ family: 'DM Sans', size: 11, weight: 'bold' }),
          formatter: (value: number) => this.formatCurrencyShort(value),
          padding: { right: 6 },
        },
      },
      scales: {
        x: { display: false },
        y: {
          grid: { display: false },
          ticks: {
            color: '#dce9f8',
            font: { family: 'DM Sans', size: 12 },
            callback: function(_, index) {
              const labels = this.chart.data.labels as string[];
              const label = labels?.[index] ?? '';
              return label.length > 14 ? label.slice(0, 14) + '…' : label;
            },
          },
        },
      },
    };
  }

  private pieChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' as const, labels: { color: '#6b87a6', font: { family: 'DM Sans', size: 12 }, padding: 16, boxWidth: 12 } },
        tooltip: {
          backgroundColor: 'rgba(10, 18, 40, 0.95)', borderColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
          titleColor: '#dce9f8', bodyColor: '#6b87a6', padding: 10,
          callbacks: {
            label: ctx => {
              const value = ctx.parsed;
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return ` ${this.formatCurrency(value)} (${pct}%)`;
            },
          },
        },
        datalabels: { display: false },
      },
    };
  }

  // ── Aggregation helpers ───────────────────────────────────────────
  private aggregateMonthly(
    members: { monthly: { month: string; totalIncome: number; totalExpense: number }[] | null }[]
  ): { month: string; totalIncome: number; totalExpense: number }[] {
    const map = new Map<string, { totalIncome: number; totalExpense: number }>();
    for (const m of members) {
      if (m.monthly === null) continue;
      for (const entry of m.monthly) {
        const existing = map.get(entry.month) ?? { totalIncome: 0, totalExpense: 0 };
        map.set(entry.month, {
          totalIncome:  existing.totalIncome  + (entry.totalIncome  ?? 0),
          totalExpense: existing.totalExpense + (entry.totalExpense ?? 0),
        });
      }
    }
    return Array.from(map.entries()).map(([month, v]) => ({ month, ...v }));
  }

  private aggregateCategories(
    members: { incomes: CategoryAmountDto[] | null; expenses: CategoryAmountDto[] | null }[],
    field: 'incomes' | 'expenses'
  ): CategoryAmountDto[] {
    const map = new Map<string, number>();
    for (const m of members) {
      const items = m[field];
      if (items === null) continue;
      for (const item of items) {
        map.set(item.category, (map.get(item.category) ?? 0) + item.total);
      }
    }
    return Array.from(map.entries()).map(([category, total]) => ({ category, total }));
  }

  private aggregateIssuerRisk(
    members: { issuerRisk: IssuerRiskDto[] | null }[]
  ): IssuerRiskDto[] {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.issuerRisk === null) continue;
      for (const item of m.issuerRisk) {
        map.set(item.legalEntityName, (map.get(item.legalEntityName) ?? 0) + item.totalCurrentValue);
      }
    }
    return Array.from(map.entries()).map(([legalEntityName, totalCurrentValue]) => ({ legalEntityName, totalCurrentValue }));
  }

  private aggregateIndexerSummary(
    members: { indexerSummary: IndexerSummaryDto[] | null }[]
  ): IndexerSummaryDto[] {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.indexerSummary === null) continue;
      for (const item of m.indexerSummary) {
        map.set(item.indexer, (map.get(item.indexer) ?? 0) + item.totalCurrentValue);
      }
    }
    return Array.from(map.entries()).map(([indexer, totalCurrentValue]) => ({ indexer, totalCurrentValue }));
  }

  private aggregateLiquiditySummary(
    members: { liquidityTypeSummary: LiquiditySummaryDto[] | null }[]
  ): LiquiditySummaryDto[] {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.liquidityTypeSummary === null) continue;
      for (const item of m.liquidityTypeSummary) {
        map.set(item.liquidityType, (map.get(item.liquidityType) ?? 0) + item.totalCurrentValue);
      }
    }
    return Array.from(map.entries()).map(([liquidityType, totalCurrentValue]) => ({ liquidityType, totalCurrentValue }));
  }

  // ── Date helpers ──────────────────────────────────────────────────
  private generateMonthsBetween(startDate: string, endDate: string): string[] {
    const months: string[] = [];
    const start   = new Date(startDate + 'T00:00:00');
    const end     = new Date(endDate   + 'T00:00:00');
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const last    = new Date(end.getFullYear(),   end.getMonth(),   1);
    while (current <= last) {
      months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  }

  private formatMonthLabel(yearMonth: string): string {
    const [year, month] = yearMonth.split('-');
    const abbr = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${abbr[parseInt(month, 10) - 1]}/${year.slice(2)}`;
  }

  private getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0);
    return { startDate: DashboardComponent.toIsoDate(start), endDate: DashboardComponent.toIsoDate(end) };
  }

  private setBarContainerHeight(canvas: HTMLCanvasElement, itemCount: number): void {
    const BAR_ITEM_HEIGHT = 42;
    const MIN_HEIGHT = 80;
    const container = canvas.parentElement as HTMLElement;
    container.style.height = `${Math.max(itemCount * BAR_ITEM_HEIGHT, MIN_HEIGHT)}px`;
  }

  private truncateLabel(label: string, maxLength = 22): string {
    return label.length > maxLength ? label.slice(0, maxLength) + '…' : label;
  }

  // ── Formatting ────────────────────────────────────────────────────
  formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private formatCurrencyShort(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000)     return `R$${(value / 1_000).toFixed(1)}k`;
    return `R$${value.toFixed(0)}`;
  }

  getMemberInitials(user: UserDto): string {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
}