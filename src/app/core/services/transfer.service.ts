import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { normalizeType } from '../utils/pocket.utils';
import { environment } from '../../../environments/environment';
import { TransferResultDto } from '../models/transaction.model';
import { SessionService } from './session.service';

export interface TransferPayload {
  sourcePocketId: number;
  targetPocketId: number;
  amount: number;
  description: string;
}

export interface GroupPocketDto {
  id: number;
  type: string;
  label: string;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
}

@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly session = inject(SessionService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  transfer(payload: TransferPayload): Observable<TransferResultDto> {
    return this.session.scoped(() => this.http.post<TransferResultDto>(`${this.baseUrl}/transfers`, payload));
  }

  fgtsWithdrawal(payload: TransferPayload): Observable<TransferResultDto> {
    return this.session.scoped(() => this.http.post<TransferResultDto>(`${this.baseUrl}/transfers/fgts/withdrawal`, payload));
  }

  getGroupPockets(groupId: number): Observable<GroupPocketDto[]> {
    return this.session.scoped(() => this.http.get<GroupPocketDto[]>(`${this.baseUrl}/groups/${groupId}/share/pockets`)).pipe(
      map(pockets =>
        pockets
          .map(p => ({ ...p, type: normalizeType(p.type) }))
          .filter(p => p.type === 'BANK_ACCOUNT' || p.type === 'CASH')
      )
    );
  }
}
