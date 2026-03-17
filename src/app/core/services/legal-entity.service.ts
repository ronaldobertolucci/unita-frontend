import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  LegalEntityDto,
  CreateLegalEntityPayload,
  UpdateLegalEntityPayload,
} from '../models/legal-entity.model';

@Injectable({ providedIn: 'root' })
export class LegalEntityService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _legalEntities = signal<LegalEntityDto[]>([]);
  readonly legalEntities = this._legalEntities.asReadonly();

  // ─── Listagem ─────────────────────────────────────────────────────────────

  loadLegalEntities(): Observable<LegalEntityDto[]> {
    return this.http.get<LegalEntityDto[]>(`${this.base}/legal-entities`).pipe(
      tap(list => this._legalEntities.set(list))
    );
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  create(payload: CreateLegalEntityPayload): Observable<LegalEntityDto> {
    return this.http.post<LegalEntityDto>(`${this.base}/legal-entities`, payload).pipe(
      tap(created => this._legalEntities.update(list => [...list, created]))
    );
  }

  update(id: number, payload: UpdateLegalEntityPayload): Observable<LegalEntityDto> {
    return this.http.patch<LegalEntityDto>(`${this.base}/legal-entities/${id}`, payload).pipe(
      tap(updated => this._legalEntities.update(list =>
        list.map(e => e.id === id ? updated : e)
      ))
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/legal-entities/${id}`).pipe(
      tap(() => this._legalEntities.update(list => list.filter(e => e.id !== id)))
    );
  }
}