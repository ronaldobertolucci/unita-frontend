import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  IndividualEmployerDto,
  LegalEntityEmployerDto,
  CreateIndividualEmployerPayload,
  UpdateIndividualEmployerPayload,
  CreateLegalEntityEmployerPayload,
  UpdateLegalEntityEmployerPayload,
} from '../models/legal-entity.model';

@Injectable({ providedIn: 'root' })
export class EmployerService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _individualEmployers = signal<IndividualEmployerDto[]>([]);
  readonly individualEmployers = this._individualEmployers.asReadonly();

  private readonly _legalEntityEmployers = signal<LegalEntityEmployerDto[]>([]);
  readonly legalEntityEmployers = this._legalEntityEmployers.asReadonly();

  // ─── Empregador PF ────────────────────────────────────────────────────────

  loadIndividualEmployers(): Observable<IndividualEmployerDto[]> {
    return this.http.get<IndividualEmployerDto[]>(`${this.base}/employers/individual`).pipe(
      tap(list => this._individualEmployers.set(list))
    );
  }

  createIndividual(payload: CreateIndividualEmployerPayload): Observable<IndividualEmployerDto> {
    return this.http.post<IndividualEmployerDto>(`${this.base}/employers/individual`, payload).pipe(
      tap(created => this._individualEmployers.update(list => [...list, created]))
    );
  }

  updateIndividual(id: number, payload: UpdateIndividualEmployerPayload): Observable<IndividualEmployerDto> {
    return this.http.patch<IndividualEmployerDto>(`${this.base}/employers/individual/${id}`, payload).pipe(
      tap(updated => this._individualEmployers.update(list =>
        list.map(e => e.id === id ? updated : e)
      ))
    );
  }

  deleteIndividual(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/employers/individual/${id}`).pipe(
      tap(() => this._individualEmployers.update(list => list.filter(e => e.id !== id)))
    );
  }

  // ─── Empregador PJ ────────────────────────────────────────────────────────

  loadLegalEntityEmployers(): Observable<LegalEntityEmployerDto[]> {
    return this.http.get<LegalEntityEmployerDto[]>(`${this.base}/employers/legal-entity`).pipe(
      tap(list => this._legalEntityEmployers.set(list))
    );
  }

  createLegalEntity(payload: CreateLegalEntityEmployerPayload): Observable<LegalEntityEmployerDto> {
    return this.http.post<LegalEntityEmployerDto>(`${this.base}/employers/legal-entity`, payload).pipe(
      tap(created => this._legalEntityEmployers.update(list => [...list, created]))
    );
  }

  updateLegalEntity(id: number, payload: UpdateLegalEntityEmployerPayload): Observable<LegalEntityEmployerDto> {
    return this.http.patch<LegalEntityEmployerDto>(`${this.base}/employers/legal-entity/${id}`, payload).pipe(
      tap(updated => this._legalEntityEmployers.update(list =>
        list.map(e => e.id === id ? updated : e)
      ))
    );
  }

  deleteLegalEntity(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/employers/legal-entity/${id}`).pipe(
      tap(() => this._legalEntityEmployers.update(list => list.filter(e => e.id !== id)))
    );
  }
}