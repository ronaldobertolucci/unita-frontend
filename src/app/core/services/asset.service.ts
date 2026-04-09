import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssetSummaryDto,
  AssetDetailDto,
  InvestmentTransactionDto,
  CreateFixedIncomePayload,
  CreatePensionPayload,
  UpdateAssetPayload,
  UpdatePositionPayload,
  BuyPayload,
  YieldPayload,
  SellPayload,
} from '../models/asset.model';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly base = `${environment.apiUrl}/assets`;

  readonly assets = signal<AssetSummaryDto[]>([]);
  readonly isLoading = signal(false);

  constructor(private http: HttpClient) {}

  loadAssets(): void {
    this.isLoading.set(true);
    this.http.get<AssetSummaryDto[]>(this.base).subscribe({
      next: (data) => {
        this.assets.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  getAsset(id: number): Observable<AssetDetailDto> {
    return this.http.get<AssetDetailDto>(`${this.base}/${id}`);
  }

  createFixedIncome(payload: CreateFixedIncomePayload): Observable<AssetDetailDto> {
    return this.http.post<AssetDetailDto>(`${this.base}/fixed-income`, payload).pipe(
      tap((created) => this.assets.update((list) => [...list, this.toSummary(created)])),
    );
  }

  createPension(payload: CreatePensionPayload): Observable<AssetDetailDto> {
    return this.http.post<AssetDetailDto>(`${this.base}/pension`, payload).pipe(
      tap((created) => this.assets.update((list) => [...list, this.toSummary(created)])),
    );
  }

  updateAsset(id: number, payload: UpdateAssetPayload): Observable<AssetDetailDto> {
    return this.http.patch<AssetDetailDto>(`${this.base}/${id}`, payload).pipe(
      tap((updated) =>
        this.assets.update((list) =>
          list.map((a) => (a.id === id ? this.toSummary(updated) : a)),
        ),
      ),
    );
  }

  deleteAsset(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this.assets.update((list) => list.filter((a) => a.id !== id))),
    );
  }

  updatePosition(id: number, payload: UpdatePositionPayload): Observable<AssetDetailDto> {
    return this.http.patch<AssetDetailDto>(`${this.base}/${id}/position`, payload).pipe(
      tap((updated) =>
        this.assets.update((list) =>
          list.map((a) => (a.id === id ? this.toSummary(updated) : a)),
        ),
      ),
    );
  }

  getTransactions(id: number): Observable<InvestmentTransactionDto[]> {
    return this.http.get<InvestmentTransactionDto[]>(`${this.base}/${id}/transactions`);
  }

  buy(id: number, payload: BuyPayload): Observable<InvestmentTransactionDto> {
    return this.http.post<InvestmentTransactionDto>(
      `${this.base}/${id}/transactions/buy`,
      payload,
    );
  }

  recordYield(id: number, payload: YieldPayload): Observable<InvestmentTransactionDto> {
    return this.http.post<InvestmentTransactionDto>(
      `${this.base}/${id}/transactions/yield`,
      payload,
    );
  }

  sell(id: number, payload: SellPayload): Observable<InvestmentTransactionDto[]> {
    return this.http.post<InvestmentTransactionDto[]>(
      `${this.base}/${id}/transactions/sell`,
      payload,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private toSummary(detail: AssetDetailDto): AssetSummaryDto {
    return {
      id: detail.id,
      name: detail.name,
      category: detail.category,
      status: detail.status,
      legalEntityName:
        detail.legalEntity.tradeName ?? detail.legalEntity.corporateName,
      currentValue: detail.position.currentValue,
      totalInvested: detail.position.totalInvested,
      redeemedValue: detail.position.redeemedValue,
    };
  }
}