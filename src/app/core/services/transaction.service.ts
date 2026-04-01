import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateTransactionPayload, TransactionDto } from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  private _transactions = signal<TransactionDto[]>([]);
  readonly transactions = this._transactions.asReadonly();

  loadTransactions(pocketId: number, startDate?: string, endDate?: string): Observable<TransactionDto[]> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http
      .get<TransactionDto[]>(`${this.baseUrl}/pockets/${pocketId}/transactions`, { params })
      .pipe(tap(data => this._transactions.set(data)));
  }

  createTransaction(pocketId: number, payload: CreateTransactionPayload): Observable<TransactionDto> {
    return this.http
      .post<TransactionDto>(`${this.baseUrl}/pockets/${pocketId}/transactions`, payload);
  }

  deleteTransaction(pocketId: number, transactionId: number): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/pockets/${pocketId}/transactions/${transactionId}`)
      .pipe(tap(() => this._transactions.update(list => list.filter(t => t.id !== transactionId))));
  }

  clearTransactions(): void {
    this._transactions.set([]);
  }
}