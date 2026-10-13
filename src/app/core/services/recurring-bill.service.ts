import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { RecurringBill, RecurringBillPage, RecurringBillPayload, RecurringOccurrence } from '../models/recurring-bill.model';
import { SessionService } from './session.service';

export type RecurringRecovery = { kind: 'create' } | {
  kind: 'update'; id: number; draft: RecurringBillPayload; frequencyLocked: boolean;
};

@Injectable({ providedIn: 'root' })
export class RecurringBillService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly url = `${environment.apiUrl}/recurring-bills`;
  // Preserve uncertain operations across navigation; clear when the session ends.
  readonly recovery = signal<RecurringRecovery | null>(null);

  constructor() {
    this.session.registerCleanup(() => this.recovery.set(null), inject(DestroyRef));
  }

  list(page = 0, active?: boolean) {
    let params = new HttpParams().set('page', page).set('size', 20);
    if (active !== undefined) params = params.set('active', active);
    return this.session.scoped(() => this.http.get<RecurringBillPage>(this.url, { params }));
  }
  upcoming(month: string) {
    return this.session.scoped(() => this.http.get<RecurringOccurrence[]>(`${this.url}/upcoming`, { params: { month } }));
  }
  detail(id: number) {
    return this.session.scoped(() => this.http.get<RecurringBill>(`${this.url}/${id}`));
  }
  create(payload: RecurringBillPayload) {
    return this.session.scoped(() => this.http.post<RecurringBill>(this.url, payload));
  }
  update(id: number, payload: RecurringBillPayload, version: number) {
    return this.session.scoped(() => this.http.patch<RecurringBill>(`${this.url}/${id}`, { ...payload, version }));
  }
}
