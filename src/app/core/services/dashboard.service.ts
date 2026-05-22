import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ── Shared ────────────────────────────────────────────────────────────────────

export interface UserDto {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface PocketTotalDto {
  category: string;
  total: number;
}

export interface InvestmentTotalDto {
  category: string;
  total: number;
}

export interface CategoryAmountDto {
  category: string;
  total: number;
}

export interface MonthlyDataDto {
  month: string;
  totalIncome: number;
  totalExpense: number;
}

export interface IssuerRiskDto {
  legalEntityName: string;
  totalCurrentValue: number;
}

export interface IndexerSummaryDto {
  indexer: string;
  totalCurrentValue: number;
}

export interface LiquiditySummaryDto {
  liquidityType: string;
  totalCurrentValue: number;
}

// ── Individual ────────────────────────────────────────────────────────────────

export interface DashboardDto {
  pockets: PocketTotalDto[];
  investments: InvestmentTotalDto[];
  totalOpenBills: number;
}

export interface DashboardCategorySummaryDto {
  incomes: CategoryAmountDto[];
  expenses: CategoryAmountDto[];
}

// ── Group ─────────────────────────────────────────────────────────────────────

export interface GroupMemberDashboardDto {
  user: UserDto;
  pockets: PocketTotalDto[] | null;
  investments: InvestmentTotalDto[] | null;
  totalOpenBills: number | null;
}

export interface GroupDashboardDto {
  members: GroupMemberDashboardDto[];
}

export interface GroupMemberMonthlyDto {
  user: UserDto;
  monthly: MonthlyDataDto[] | null;
}

export interface GroupMonthlyResponseDto {
  members: GroupMemberMonthlyDto[];
}

export interface GroupMemberCategorySummaryDto {
  user: UserDto;
  incomes: CategoryAmountDto[] | null;
  expenses: CategoryAmountDto[] | null;
}

export interface GroupCategorySummaryResponseDto {
  members: GroupMemberCategorySummaryDto[];
}

export interface GroupMemberIssuerRiskDto {
  user: UserDto;
  issuerRisk: IssuerRiskDto[] | null;
}

export interface GroupIssuerRiskResponseDto {
  members: GroupMemberIssuerRiskDto[];
}

export interface GroupMemberIndexerSummaryDto {
  user: UserDto;
  indexerSummary: IndexerSummaryDto[] | null;
}

export interface GroupIndexerSummaryResponseDto {
  members: GroupMemberIndexerSummaryDto[];
}

export interface GroupMemberLiquiditySummaryDto {
  user: UserDto;
  liquidityTypeSummary: LiquiditySummaryDto[] | null;
}

export interface GroupLiquiditySummaryResponseDto {
  members: GroupMemberLiquiditySummaryDto[];
}

export interface GroupMemberNetProfitDto {
  user: UserDto;
  netProfit: number | null;
}

export interface GroupNetProfitResponseDto {
  members: GroupMemberNetProfitDto[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  // Individual
  getDashboard(): Observable<DashboardDto> {
    return this.http.get<DashboardDto>(`${this.baseUrl}/dashboard`);
  }

  getMonthly(startDate: string, endDate: string): Observable<MonthlyDataDto[]> {
    return this.http.get<MonthlyDataDto[]>(`${this.baseUrl}/dashboard/monthly`, {
      params: { startDate, endDate },
    });
  }

  getCategorySummary(startDate: string, endDate: string): Observable<DashboardCategorySummaryDto> {
    return this.http.get<DashboardCategorySummaryDto>(`${this.baseUrl}/dashboard/summary`, {
      params: { startDate, endDate },
    });
  }

  getIssuerRisk(): Observable<IssuerRiskDto[]> {
    return this.http.get<IssuerRiskDto[]>(`${this.baseUrl}/dashboard/issuer-risk`);
  }

  getIndexerSummary(): Observable<IndexerSummaryDto[]> {
    return this.http.get<IndexerSummaryDto[]>(`${this.baseUrl}/dashboard/indexer-summary`);
  }

  // Group
  getGroupDashboard(groupId: number): Observable<GroupDashboardDto> {
    return this.http.get<GroupDashboardDto>(`${this.baseUrl}/groups/${groupId}/dashboard`);
  }

  getGroupMonthly(groupId: number, startDate: string, endDate: string): Observable<GroupMonthlyResponseDto> {
    return this.http.get<GroupMonthlyResponseDto>(`${this.baseUrl}/groups/${groupId}/dashboard/monthly`, {
      params: { startDate, endDate },
    });
  }

  getGroupCategorySummary(groupId: number, startDate: string, endDate: string): Observable<GroupCategorySummaryResponseDto> {
    return this.http.get<GroupCategorySummaryResponseDto>(`${this.baseUrl}/groups/${groupId}/dashboard/summary`, {
      params: { startDate, endDate },
    });
  }

  getGroupIssuerRisk(groupId: number): Observable<GroupIssuerRiskResponseDto> {
    return this.http.get<GroupIssuerRiskResponseDto>(`${this.baseUrl}/groups/${groupId}/dashboard/issuer-risk`);
  }

  getGroupIndexerSummary(groupId: number): Observable<GroupIndexerSummaryResponseDto> {
    return this.http.get<GroupIndexerSummaryResponseDto>(`${this.baseUrl}/groups/${groupId}/dashboard/indexer-summary`);
  }

  getLiquiditySummary(): Observable<LiquiditySummaryDto[]> {
    return this.http.get<LiquiditySummaryDto[]>(`${this.baseUrl}/dashboard/liquidity-summary`);
  }

  getGroupLiquiditySummary(groupId: number): Observable<GroupLiquiditySummaryResponseDto> {
    return this.http.get<GroupLiquiditySummaryResponseDto>(`${this.baseUrl}/groups/${groupId}/dashboard/liquidity-summary`);
  }

  getNetProfit(): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/dashboard/net-profit`);
  }

  getGroupNetProfit(groupId: number): Observable<GroupNetProfitResponseDto> {
    return this.http.get<GroupNetProfitResponseDto>(`${this.baseUrl}/groups/${groupId}/dashboard/net-profit`);
  }
}