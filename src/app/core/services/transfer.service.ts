import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { normalizeType } from '../utils/pocket.utils';
import { environment } from '../../../environments/environment';

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
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  transfer(payload: TransferPayload): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/transfers`, payload);
  }

  getGroupPockets(groupId: number): Observable<GroupPocketDto[]> {
    return this.http.get<GroupPocketDto[]>(`${this.baseUrl}/groups/${groupId}/share/pockets`).pipe(
      map(pockets =>
        pockets
          .map(p => ({ ...p, type: normalizeType(p.type) }))
          .filter(p => p.type === 'BANK_ACCOUNT' || p.type === 'CASH')
      )
    );
  }
}