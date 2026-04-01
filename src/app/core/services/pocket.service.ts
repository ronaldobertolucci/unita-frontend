import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { normalizeType } from '../utils/pocket.utils';
import {
  PocketSummaryDto,
  BankAccountDto,
  BenefitAccountDto,
  FgtsEmployerAccountDto,
  CashDto,
  BankAccountTypeDto,
  BenefitTypeDto,
  LegalEntityDto,
  IndividualEmployerDto,
  LegalEntityEmployerDto,
  CreateBankAccountPayload,
  CreateBenefitAccountPayload,
  CreateFgtsPayload,
  UpdateBankAccountPayload,
  UpdateBenefitAccountPayload,
  UpdateFgtsPayload,
} from '../models/pocket.model';

// ─── Dados de referência hardcoded ──────────────────────────────────────────

export const BANK_ACCOUNT_TYPES: BankAccountTypeDto[] = [
  { id: 1, name: 'Corrente' },
  { id: 2, name: 'Poupança' },
  { id: 3, name: 'Salário' },
  { id: 4, name: 'Investimento' },
];

export const BENEFIT_TYPES: BenefitTypeDto[] = [
  { id: 1, name: 'Vale-Alimentação' },
  { id: 2, name: 'Vale-Refeição' },
];

// ────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PocketService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _pockets = signal<PocketSummaryDto[]>([]);
  readonly pockets = this._pockets.asReadonly();

  // ─── Listagem ─────────────────────────────────────────────────────────────

  loadPockets(): Observable<PocketSummaryDto[]> {
    return this.http.get<any[]>(`${this.base}/pockets/my`).pipe(
      map(list => list.map(p => ({
        ...p,
        type: normalizeType(p.type),
      }))),
      tap(list => this._pockets.set(list))
    );
  }

  // ─── Dados de referência (carregados sob demanda) ─────────────────────────

  getLegalEntities(): Observable<LegalEntityDto[]> {
    return this.http.get<LegalEntityDto[]>(`${this.base}/legal-entities`);
  }

  getIndividualEmployers(): Observable<IndividualEmployerDto[]> {
    return this.http.get<IndividualEmployerDto[]>(`${this.base}/employers/individual`);
  }

  getLegalEntityEmployers(): Observable<LegalEntityEmployerDto[]> {
    return this.http.get<LegalEntityEmployerDto[]>(`${this.base}/employers/legal-entity`);
  }

  // ─── Conta Bancária ───────────────────────────────────────────────────────

  getBankAccount(id: number): Observable<BankAccountDto> {
    return this.http.get<BankAccountDto>(`${this.base}/pockets/bank-accounts/${id}`);
  }

  createBankAccount(payload: CreateBankAccountPayload): Observable<BankAccountDto> {
    return this.http.post<BankAccountDto>(`${this.base}/pockets/bank-accounts`, payload).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }

  updateBankAccount(id: number, payload: UpdateBankAccountPayload): Observable<BankAccountDto> {
    return this.http.put<BankAccountDto>(`${this.base}/pockets/bank-accounts/${id}`, payload).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }

  deleteBankAccount(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/pockets/bank-accounts/${id}`).pipe(
      tap(() => this._pockets.update(list => list.filter(p => p.id !== id)))
    );
  }

  // ─── Conta de Benefício ───────────────────────────────────────────────────

  getBenefitAccount(id: number): Observable<BenefitAccountDto> {
    return this.http.get<BenefitAccountDto>(`${this.base}/pockets/benefit-accounts/${id}`);
  }

  createBenefitAccount(payload: CreateBenefitAccountPayload): Observable<BenefitAccountDto> {
    return this.http.post<BenefitAccountDto>(`${this.base}/pockets/benefit-accounts`, payload).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }

  updateBenefitAccount(id: number, payload: UpdateBenefitAccountPayload): Observable<BenefitAccountDto> {
    return this.http.put<BenefitAccountDto>(`${this.base}/pockets/benefit-accounts/${id}`, payload).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }

  deleteBenefitAccount(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/pockets/benefit-accounts/${id}`).pipe(
      tap(() => this._pockets.update(list => list.filter(p => p.id !== id)))
    );
  }

  // ─── FGTS ─────────────────────────────────────────────────────────────────

  getFgts(id: number): Observable<FgtsEmployerAccountDto> {
    return this.http.get<FgtsEmployerAccountDto>(`${this.base}/pockets/fgts/${id}`);
  }

  createFgts(payload: CreateFgtsPayload): Observable<FgtsEmployerAccountDto> {
    return this.http.post<FgtsEmployerAccountDto>(`${this.base}/pockets/fgts`, payload).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }

  updateFgts(id: number, payload: UpdateFgtsPayload): Observable<FgtsEmployerAccountDto> {
    return this.http.put<FgtsEmployerAccountDto>(`${this.base}/pockets/fgts/${id}`, payload).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }

  deleteFgts(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/pockets/fgts/${id}`).pipe(
      tap(() => this._pockets.update(list => list.filter(p => p.id !== id)))
    );
  }

  // ─── Carteira (Cash) ──────────────────────────────────────────────────────

  getCash(): Observable<CashDto> {
    return this.http.get<CashDto>(`${this.base}/pockets/cash`);
  }

  createCash(): Observable<CashDto> {
    return this.http.post<CashDto>(`${this.base}/pockets/cash`, {}).pipe(
      tap(() => this.loadPockets().subscribe())
    );
  }
}