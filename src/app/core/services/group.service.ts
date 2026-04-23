import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  GroupDto,
  GroupMembership,
  CreateGroupRequest,
  UpdateGroupRequest,
  TransferResponsibilityRequest,
} from '../models/group.model';

export type ShareType =
  | 'BALANCE'
  | 'CREDIT_CARD_BILLS'
  | 'INVESTMENTS'
  | 'EXPENSES_BY_CATEGORY'
  | 'INCOME_BY_CATEGORY';

export interface SharePermissionDto {
  shareType: ShareType;
  enabled: boolean;
}

export interface UpdateSharePermissionsRequest {
  permissions: SharePermissionDto[];
}

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly http = inject(HttpClient);

  private readonly _myGroups = signal<GroupDto[]>([]);
  private readonly _loading = signal(false);

  readonly myGroups = this._myGroups.asReadonly();
  readonly loading = this._loading.asReadonly();

  loadMyGroups(): void {
    this._loading.set(true);
    this.http
      .get<GroupDto[]>(`${environment.apiUrl}/groups/my`)
      .subscribe({
        next: data => {
          this._myGroups.set(data);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }

  loadMyGroups$(): Observable<GroupDto[]> {
    return this.http.get<GroupDto[]>(`${environment.apiUrl}/groups/my`).pipe(
      tap(data => {
        this._myGroups.set(data);
        this._loading.set(false);
      }),
      tap({ subscribe: () => this._loading.set(true) })
    );
  }

  getGroup(id: number): Observable<GroupDto> {
    return this.http.get<GroupDto>(`${environment.apiUrl}/groups/${id}`);
  }

  createGroup(request: CreateGroupRequest): Observable<GroupDto> {
    return this.http
      .post<GroupDto>(`${environment.apiUrl}/groups`, request)
      .pipe(tap(group => this._myGroups.update(list => [...list, group])));
  }

  updateGroup(id: number, request: UpdateGroupRequest): Observable<GroupDto> {
    return this.http
      .put<GroupDto>(`${environment.apiUrl}/groups/${id}`, request)
      .pipe(
        tap(updated =>
          this._myGroups.update(list =>
            list.map(g => (g.id === id ? updated : g))
          )
        )
      );
  }

  transferResponsibility(
    id: number,
    request: TransferResponsibilityRequest
  ): Observable<GroupDto> {
    return this.http.put<GroupDto>(
      `${environment.apiUrl}/groups/${id}/transfer`,
      request
    );
  }

  deleteGroup(id: number): Observable<void> {
    return this.http
      .delete<void>(`${environment.apiUrl}/groups/${id}`)
      .pipe(tap(() => this._myGroups.update(list => list.filter(g => g.id !== id))));
  }

  leaveGroup(id: number): Observable<void> {
    return this.http
      .delete<void>(`${environment.apiUrl}/groups/${id}/leave`)
      .pipe(tap(() => this._myGroups.update(list => list.filter(g => g.id !== id))));
  }

  getMembers(id: number): Observable<GroupMembership[]> {
    return this.http.get<GroupMembership[]>(
      `${environment.apiUrl}/groups/${id}/members`
    );
  }

  getSharePermissions(groupId: number): Observable<SharePermissionDto[]> {
    return this.http.get<SharePermissionDto[]>(
      `${environment.apiUrl}/groups/${groupId}/share/permissions`
    );
  }

  updateSharePermissions(
    groupId: number,
    request: UpdateSharePermissionsRequest
  ): Observable<SharePermissionDto[]> {
    return this.http.put<SharePermissionDto[]>(
      `${environment.apiUrl}/groups/${groupId}/share/permissions`,
      request
    );
  }
}