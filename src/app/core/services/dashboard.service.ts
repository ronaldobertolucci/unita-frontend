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
}