import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GroupInvitation } from '../models/invitation.model';

@Injectable({ providedIn: 'root' })
export class InvitationService {
  private readonly http = inject(HttpClient);

  getGroupInvitations(groupId: number): Observable<GroupInvitation[]> {
    return this.http.get<GroupInvitation[]>(
      `${environment.apiUrl}/invitations/group/${groupId}`
    );
  }

  createInvitation(
    groupId: number,
    invitedUserEmail: string
  ): Observable<GroupInvitation> {
    return this.http.post<GroupInvitation>(
      `${environment.apiUrl}/invitations`,
      { groupId, invitedUserEmail }
    );
  }

  cancelInvitation(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/invitations/${id}`);
  }
}