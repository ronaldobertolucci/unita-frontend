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
  CategoryAmountDto,
  UserDto,
} from '../../core/services/dashboard.service';
import { GroupService } from '../../core/services/group.service';
import { normalizeType } from '../../core/utils/pocket.utils';
import { translateApiError } from '../../core/utils/api-error.util';

Chart.register(
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement,
  LineController, BarController,
  Title, Tooltip, Legend, Filler,
);

type DashboardTab = 'individual' | 'groups';

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
  
  // ── Tabs ──────────────────────────────────────────────────────────
  readonly activeTab = signal<DashboardTab>('individual');

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

  // ════════════════════════════════════════════════════════════════════
  // INDIVIDUAL TAB
  // ════════════════════════════════════════════════════════════════════

  readonly isLoadingDashboard  = signal(false);
  readonly isLoadingMonthly    = signal(false);
  readonly isLoadingCategory   = signal(false);
  readonly errorMessage        = signal<string | null>(null);

  readonly dashboardData = signal<DashboardDto | null>(null);
  readonly monthlyData   = signal<MonthlyDataDto[]>([]);
  readonly categoryData  = signal<DashboardCategorySummaryDto | null>(null);

  // Line chart date range
  readonly lineStartDate = signal<string>(DashboardComponent.defaultLineRange().start);
  readonly lineEndDate   = signal<string>(DashboardComponent.defaultLineRange().end);

  // Category date selector
  readonly selectedMonth = signal<number>(DashboardComponent.previousMonth().month);
  readonly selectedYear  = signal<number>(DashboardComponent.previousMonth().year);

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
    (this.dashboardData()?.investments ?? []).map(i => ({
      label: this.investmentLabelMap[i.category] ?? i.category,
      total: i.total,
    }))
  );

  readonly investmentTotal = computed(() =>
    this.investmentRows().reduce((sum, r) => sum + r.total, 0)
  );

  readonly hasMonthlyData = computed(() => this.monthlyData().length > 0);
  readonly hasExpenseData = computed(() => (this.categoryData()?.expenses.length ?? 0) > 0);
  readonly hasIncomeData  = computed(() => (this.categoryData()?.incomes.length  ?? 0) > 0);

  // Individual canvas refs
  @ViewChild('lineChartCanvas')    lineChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('expenseChartCanvas') expenseChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('incomeChartCanvas')  incomeChartCanvas!: ElementRef<HTMLCanvasElement>;

  private lineChart: Chart | null    = null;
  private expenseChart: Chart | null = null;
  private incomeChart: Chart | null  = null;

  // ════════════════════════════════════════════════════════════════════
  // GROUP TAB
  // ════════════════════════════════════════════════════════════════════

  readonly groups = this.groupService.myGroups;

  readonly selectedGroupId   = signal<number | null>(null);
  readonly selectedMemberIds = signal<number[]>([]);

  readonly isLoadingGroupDashboard = signal(false);
  readonly isLoadingGroupMonthly   = signal(false);
  readonly isLoadingGroupCategory  = signal(false);
  readonly groupErrorMessage       = signal<string | null>(null);

  readonly groupDashboardData = signal<GroupDashboardDto | null>(null);
  readonly groupMonthlyData   = signal<GroupMonthlyResponseDto | null>(null);
  readonly groupCategoryData  = signal<GroupCategorySummaryResponseDto | null>(null);

  // Group line chart date range
  readonly groupLineStartDate = signal<string>(DashboardComponent.defaultLineRange().start);
  readonly groupLineEndDate   = signal<string>(DashboardComponent.defaultLineRange().end);

  // Group category date selector
  readonly groupSelectedMonth = signal<number>(DashboardComponent.previousMonth().month);
  readonly groupSelectedYear  = signal<number>(DashboardComponent.previousMonth().year);

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
    return Array.from(totals.entries()).map(([label, total]) => ({ label, total }));
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

  readonly groupHasMonthlyData = computed(() =>
    this.filteredMonthlyMembers().some(m => (m.monthly?.length ?? 0) > 0)
  );

  readonly groupHasExpenseData = computed(() =>
    this.filteredCategoryMembers().some(m => (m.expenses?.length ?? 0) > 0)
  );

  readonly groupHasIncomeData = computed(() =>
    this.filteredCategoryMembers().some(m => (m.incomes?.length ?? 0) > 0)
  );

  // Group canvas refs
  @ViewChild('groupLineChartCanvas')    groupLineChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupExpenseChartCanvas') groupExpenseChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('groupIncomeChartCanvas')  groupIncomeChartCanvas!: ElementRef<HTMLCanvasElement>;

  private groupLineChart: Chart | null    = null;
  private groupExpenseChart: Chart | null = null;
  private groupIncomeChart: Chart | null  = null;

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
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnInit(): void {
    this.groupService.loadMyGroups$().subscribe();
    this.loadDashboard();
    this.loadMonthly();
    this.loadCategoryData();
  }

  ngOnDestroy(): void {
    this.lineChart?.destroy();
    this.expenseChart?.destroy();
    this.incomeChart?.destroy();
    this.groupLineChart?.destroy();
    this.groupExpenseChart?.destroy();
    this.groupIncomeChart?.destroy();
  }

  // ════════════════════════════════════════════════════════════════════
  // INDIVIDUAL — Actions
  // ════════════════════════════════════════════════════════════════════

  setTab(tab: DashboardTab): void {
    this.activeTab.set(tab);
  }

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
    const { startDate, endDate } = this.getMonthRange(this.selectedYear(), this.selectedMonth());
    this.dashboardService.getCategorySummary(startDate, endDate).subscribe({
      next: data => {
        this.categoryData.set(data);
        this.isLoadingCategory.set(false);
        this.renderBarCharts();
      },
      error: () => this.isLoadingCategory.set(false),
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

  onMonthChange(event: Event): void {
    this.selectedMonth.set(Number((event.target as HTMLSelectElement).value));
    this.loadCategoryData();
  }

  onYearChange(event: Event): void {
    this.selectedYear.set(Number((event.target as HTMLSelectElement).value));
    this.loadCategoryData();
  }

  // ════════════════════════════════════════════════════════════════════
  // GROUP — Actions
  // ════════════════════════════════════════════════════════════════════

  onGroupSelect(event: Event): void {
    const groupId = Number((event.target as HTMLSelectElement).value);
    this.selectedGroupId.set(groupId);

    const prev = DashboardComponent.previousMonth();
    const range = DashboardComponent.defaultLineRange();
    this.groupSelectedMonth.set(prev.month);
    this.groupSelectedYear.set(prev.year);
    this.groupLineStartDate.set(range.start);
    this.groupLineEndDate.set(range.end);
    this.selectedMemberIds.set([]);
    this.groupDashboardData.set(null);
    this.groupMonthlyData.set(null);
    this.groupCategoryData.set(null);
    this.groupErrorMessage.set(null);

    this.loadGroupDashboard(groupId);
    this.loadGroupMonthly(groupId);
    this.loadGroupCategoryData(groupId);
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

  onGroupMonthChange(event: Event): void {
    this.groupSelectedMonth.set(Number((event.target as HTMLSelectElement).value));
    const groupId = this.selectedGroupId();
    if (groupId) this.loadGroupCategoryData(groupId);
  }

  onGroupYearChange(event: Event): void {
    this.groupSelectedYear.set(Number((event.target as HTMLSelectElement).value));
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
    const { startDate, endDate } = this.getMonthRange(this.groupSelectedYear(), this.groupSelectedMonth());
    this.dashboardService.getGroupCategorySummary(groupId, startDate, endDate).subscribe({
      next: data => {
        this.groupCategoryData.set(data);
        this.isLoadingGroupCategory.set(false);
      },
      error: () => this.isLoadingGroupCategory.set(false),
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // CHART RENDERING
  // ════════════════════════════════════════════════════════════════════

  private renderLineChart(): void {
    const canvas = this.lineChartCanvas?.nativeElement;
    if (!canvas) return;

    const months     = this.generateMonthsBetween(this.lineStartDate(), this.lineEndDate());
    const dataMap    = new Map(this.monthlyData().map(d => [d.month, d]));
    const incomeData  = months.map(m => dataMap.get(m)?.totalIncome  ?? 0);
    const expenseData = months.map(m => dataMap.get(m)?.totalExpense ?? 0);
    const balanceData = months.map((_, i) => (incomeData[i] ?? 0) - (expenseData[i] ?? 0));
    const labels      = months.map(m => this.formatMonthLabel(m));

    this.lineChart?.destroy();
    this.lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          this.incomeDataset(incomeData),
          this.expenseDataset(expenseData),
          this.balanceDataset(balanceData),
        ],
      },
      options: this.lineChartOptions(),
    });
  }

  private renderBarCharts(): void {
    const data = this.categoryData();

    const topExpenses = [...(data?.expenses ?? [])].sort((a, b) => b.total - a.total).slice(0, 10);
    const topIncomes  = [...(data?.incomes  ?? [])].sort((a, b) => b.total - a.total).slice(0, 10);

    const expenseCanvas = this.expenseChartCanvas?.nativeElement;
    if (expenseCanvas) {
      this.expenseChart?.destroy();
      this.expenseChart = topExpenses.length > 0
        ? new Chart(expenseCanvas, { type: 'bar', data: this.buildBarData(topExpenses, 'expense'), options: this.barChartOptions() })
        : null;
    }

    const incomeCanvas = this.incomeChartCanvas?.nativeElement;
    if (incomeCanvas) {
      this.incomeChart?.destroy();
      this.incomeChart = topIncomes.length > 0
        ? new Chart(incomeCanvas, { type: 'bar', data: this.buildBarData(topIncomes, 'income'), options: this.barChartOptions() })
        : null;
    }
  }

  private renderGroupLineChart(): void {
    const canvas = this.groupLineChartCanvas?.nativeElement;
    if (!canvas) return;

    const months     = this.generateMonthsBetween(this.groupLineStartDate(), this.groupLineEndDate());
    const merged     = this.aggregateMonthly(this.filteredMonthlyMembers());
    const dataMap    = new Map(merged.map(d => [d.month, d]));
    const incomeData  = months.map(m => dataMap.get(m)?.totalIncome  ?? 0);
    const expenseData = months.map(m => dataMap.get(m)?.totalExpense ?? 0);
    const balanceData = months.map((_, i) => (incomeData[i] ?? 0) - (expenseData[i] ?? 0));
    const labels      = months.map(m => this.formatMonthLabel(m));

    this.groupLineChart?.destroy();
    this.groupLineChart = this.groupHasMonthlyData()
      ? new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              this.incomeDataset(incomeData),
              this.expenseDataset(expenseData),
              this.balanceDataset(balanceData),
            ],
          },
          options: this.lineChartOptions(),
        })
      : null;
  }

  private renderGroupBarCharts(): void {
    const members = this.filteredCategoryMembers();

    const topExpenses = this.aggregateCategories(members, 'expenses').sort((a, b) => b.total - a.total).slice(0, 10);
    const topIncomes  = this.aggregateCategories(members, 'incomes' ).sort((a, b) => b.total - a.total).slice(0, 10);

    const expenseCanvas = this.groupExpenseChartCanvas?.nativeElement;
    if (expenseCanvas) {
      this.groupExpenseChart?.destroy();
      this.groupExpenseChart = topExpenses.length > 0
        ? new Chart(expenseCanvas, { type: 'bar', data: this.buildBarData(topExpenses, 'expense'), options: this.barChartOptions() })
        : null;
    }

    const incomeCanvas = this.groupIncomeChartCanvas?.nativeElement;
    if (incomeCanvas) {
      this.groupIncomeChart?.destroy();
      this.groupIncomeChart = topIncomes.length > 0
        ? new Chart(incomeCanvas, { type: 'bar', data: this.buildBarData(topIncomes, 'income'), options: this.barChartOptions() })
        : null;
    }
  }

  // ── Dataset builders ──────────────────────────────────────────────
  private incomeDataset(data: number[]): ChartConfiguration['data']['datasets'][0] {
    return {
      label: 'Receitas',
      data,
      borderColor: '#19e5a8',
      backgroundColor: 'rgba(25, 229, 168, 0.08)',
      fill: true, tension: 0.4,
      pointRadius: 4, pointBackgroundColor: '#19e5a8', borderWidth: 2,
    };
  }

  private expenseDataset(data: number[]): ChartConfiguration['data']['datasets'][0] {
    return {
      label: 'Despesas',
      data,
      borderColor: '#ff6b6b',
      backgroundColor: 'rgba(255, 107, 107, 0.08)',
      fill: true, tension: 0.4,
      pointRadius: 4, pointBackgroundColor: '#ff6b6b', borderWidth: 2,
    };
  }

  private balanceDataset(data: number[]): ChartConfiguration['data']['datasets'][0] {
    return {
      label: 'Saldo',
      data,
      borderColor: '#a78bfa',
      backgroundColor: 'rgba(167, 139, 250, 0.06)',
      fill: true, tension: 0.4,
      pointRadius: 4, pointBackgroundColor: '#a78bfa', borderWidth: 2,
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
      labels: items.map(i => i.category),
      datasets: [{ data: items.map(i => i.total), backgroundColor: bg, borderColor: color, borderWidth: 1, borderRadius: 4 }],
    };
  }

  // ── Chart options ─────────────────────────────────────────────────
  private lineChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#6b87a6', font: { family: 'DM Sans', size: 12 }, boxWidth: 12, padding: 16 },
        },
        tooltip: {
          backgroundColor: 'rgba(10, 18, 40, 0.95)',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1,
          titleColor: '#dce9f8',
          bodyColor: '#6b87a6',
          padding: 10,
          callbacks: { label: ctx => ` ${this.formatCurrency(ctx.parsed.y ?? 0)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6b87a6', font: { family: 'DM Sans', size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6b87a6', font: { family: 'DM Sans', size: 11 }, callback: val => this.formatCurrencyShort(Number(val)) },
        },
      },
    };
  }

  private barChartOptions(): ChartConfiguration['options'] {
    return {
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 18, 40, 0.95)',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1,
          titleColor: '#dce9f8',
          bodyColor: '#6b87a6',
          padding: 10,
          callbacks: { label: ctx => ` ${this.formatCurrency(ctx.parsed.x ?? 0)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6b87a6', font: { family: 'DM Sans', size: 11 }, callback: val => this.formatCurrencyShort(Number(val)) },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#dce9f8', font: { family: 'DM Sans', size: 12 } },
        },
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
    members: { incomes: { category: string; total: number }[] | null; expenses: { category: string; total: number }[] | null }[],
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