import { inject, Injectable, signal, DestroyRef } from '@angular/core';
import { SessionService } from './session.service';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { normalizeCnpj } from '../utils/cnpj.util';
import {
  LegalEntityDto,
  CreateLegalEntityPayload,
  UpdateLegalEntityPayload,
} from '../models/legal-entity.model';

@Injectable({ providedIn: 'root' })
export class LegalEntityService {
  private readonly session = inject(SessionService);
  private readonly sessionCleanup = this.session.registerCleanup(() => { this._legalEntities.set([]); }, inject(DestroyRef));

  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _legalEntities = signal<LegalEntityDto[]>([]);
  readonly legalEntities = this._legalEntities.asReadonly();

  // ─── Listagem ─────────────────────────────────────────────────────────────

  loadLegalEntities(): Observable<LegalEntityDto[]> {
    return this.session.scoped(() => this.http.get<LegalEntityDto[]>(`${this.base}/legal-entities`)).pipe(
      tap(list => this._legalEntities.set(this.sort(list)))
    );
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  create(payload: CreateLegalEntityPayload): Observable<LegalEntityDto> {
    const body = { ...payload, cnpj: normalizeCnpj(payload.cnpj) };
    return this.session.scoped(() => this.http.post<LegalEntityDto>(`${this.base}/legal-entities`, body)).pipe(
      tap(entity => this._legalEntities.update(list => this.sort([...list, entity])))
    );
  }

  update(id: number, payload: UpdateLegalEntityPayload): Observable<LegalEntityDto> {
    const body = { ...payload, cnpj: normalizeCnpj(payload.cnpj) };
    return this.session.scoped(() => this.http.patch<LegalEntityDto>(`${this.base}/legal-entities/${id}`, body)).pipe(
      tap(updated => this._legalEntities.update(list =>
        this.sort(list.map(e => e.id === updated.id ? updated : e))
      ))
    );
  }

  delete(id: number): Observable<void> {
    return this.session.scoped(() => this.http.delete<void>(`${this.base}/legal-entities/${id}`)).pipe(
      tap(() => this._legalEntities.update(list => list.filter(e => e.id !== id)))
    );
  }

  private sort(list: LegalEntityDto[]): LegalEntityDto[] {
    return [...list].sort((a, b) => a.corporateName.localeCompare(b.corporateName, 'pt-BR'));
  }
}
