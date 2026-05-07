import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { GroupInvitation } from '../models/invitation.model';
import { AuthService } from './auth.service';

export interface SseInvitationToast {
  invitationId: number;
  groupName: string;
  invitingUserFirstName: string;
  invitingUserLastName: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http        = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly _invitations   = signal<GroupInvitation[]>([]);
  private readonly _loading       = signal(false);
  private readonly _respondError  = signal<string | null>(null);
  private readonly _sseToast      = signal<SseInvitationToast | null>(null);

  private eventSource: EventSource | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly invitations      = this._invitations.asReadonly();
  readonly loading          = this._loading.asReadonly();
  readonly respondError     = this._respondError.asReadonly();
  readonly sseToast         = this._sseToast.asReadonly();
  readonly pendingCount     = computed(() => this._invitations().length);
  readonly hasNotifications = computed(() => this._invitations().length > 0);

  // ── Carregamento REST ───────────────────────────────────────────────────────

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
    this._respondError.set(null);
    this.http
      .put<GroupInvitation>(`${environment.apiUrl}/invitations/${id}/respond`, { accept })
      .subscribe({
        next: () => {
          this._invitations.update(list => list.filter(i => i.id !== id));
        },
        error: err => {
          this._respondError.set(
            err.error?.message ?? 'Não foi possível processar o convite. Tente novamente.'
          );
        },
      });
  }

  clearRespondError(): void {
    this._respondError.set(null);
  }

  dismissToast(): void {
    this._sseToast.set(null);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  // ── SSE ────────────────────────────────────────────────────────────────────

  connectSSE(): void {
    if (this.eventSource) return; // já conectado

    const token = this.authService.getToken();
    if (!token) return;

    const url = `${environment.apiUrl}/notifications/stream?token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('invitation', (event: MessageEvent) => {
      try {
        const payload: SseInvitationToast = JSON.parse(event.data);
        this.loadInvitations();
        this.showToast(payload);
      } catch {
        // payload malformado — ignora silenciosamente
      }
    });

    this.eventSource.onerror = () => {
      // EventSource reconecta automaticamente — sem ação necessária
    };
  }

  disconnectSSE(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  private showToast(payload: SseInvitationToast): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this._sseToast.set(payload);
    this.toastTimer = setTimeout(() => this.dismissToast(), 6000);
  }
}