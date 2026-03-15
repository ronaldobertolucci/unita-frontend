import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { GroupInvitation } from '../models/invitation.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);

  private readonly _invitations = signal<GroupInvitation[]>([]);
  private readonly _loading = signal(false);

  readonly invitations = this._invitations.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly pendingCount = computed(() => this._invitations().length);
  readonly hasNotifications = computed(() => this._invitations().length > 0);

  loadInvitations(): void {
    this._loading.set(true);
    this.http
      .get<GroupInvitation[]>(`${environment.apiUrl}/invitations/my/pending`)
      .subscribe({
        next: data => {
          this._invitations.set(data);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }

  respondToInvitation(id: number, accept: boolean): void {
    this.http
      .put<GroupInvitation>(`${environment.apiUrl}/invitations/${id}/respond`, { accept })
      .subscribe({
        next: () => {
          this._invitations.update(list => list.filter(i => i.id !== id));
        },
      });
  }
}