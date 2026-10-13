import { Injectable, InjectionToken, inject, signal, computed, DestroyRef } from '@angular/core';
import { SessionService } from './session.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { GroupInvitation } from '../models/invitation.model';
import { COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { InvitationNotice, InvitationStream, StreamSource, StreamStatus } from '../auth/invitation-stream';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, timeout } from 'rxjs';

export type SseInvitationToast = InvitationNotice;
export const INVITATION_SOURCE = new InjectionToken<(url: string) => StreamSource>('Unita EventSource', {
  providedIn: 'root', factory: () => url => new EventSource(url)
});

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly session = inject(SessionService);
  private readonly sessionCleanup = this.session.registerCleanup(() => { this.stopStream(); this.dismissToast(); this._invitations.set([]); this._loading.set(false); this._respondError.set(null); this.responding.clear(); this.reloadAfterEvent = false; }, inject(DestroyRef));

  private readonly http        = inject(HttpClient);
  private readonly browser = inject(COORDINATION_BROWSER);
  private readonly createSource = inject(INVITATION_SOURCE);
  private readonly responding = new Set<number>();
  private readonly _streamStatus = signal<StreamStatus>('stopped');
  readonly streamStatus = this._streamStatus.asReadonly();
  private wanted = false;
  private reloadAfterEvent = false;
  private stream: InvitationStream | null = null;

  private readonly _invitations   = signal<GroupInvitation[]>([]);
  private readonly _loading       = signal(false);
  private readonly _respondError  = signal<string | null>(null);
  private readonly _sseToast      = signal<SseInvitationToast | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly invitations      = this._invitations.asReadonly();
  readonly loading          = this._loading.asReadonly();
  readonly respondError     = this._respondError.asReadonly();
  readonly sseToast         = this._sseToast.asReadonly();
  readonly pendingCount     = computed(() => this._invitations().length);
  readonly hasNotifications = computed(() => this._invitations().length > 0);

  constructor() {
    const destroy = inject(DestroyRef);
    this.session.sessionUpdates$.pipe(takeUntilDestroyed(destroy)).subscribe(() => this.syncStream());
    destroy.onDestroy(() => { this.disconnectSSE(); this.dismissToast(); });
  }

  // ── Carregamento REST ───────────────────────────────────────────────────────

  loadInvitations(): void {
    if (this._loading()) return;
    this._loading.set(true);
    this.session.scoped(() => this.http
      .get<GroupInvitation[]>(`${environment.apiUrl}/invitations/my/pending`).pipe(timeout(15_000), finalize(() => {
        this._loading.set(false);
        const reload = this.reloadAfterEvent; this.reloadAfterEvent = false;
        if (reload && this.session.isAuthenticated()) this.loadInvitations();
      })))
      .subscribe({
        next: data => {
          this._invitations.set(data);
        },
        error: () => {},
      });
  }

  respondToInvitation(id: number, accept: boolean): void {
    if (this.responding.has(id)) return;
    this.responding.add(id);
    this._respondError.set(null);
    this.session.scoped(() => this.http
      .put<GroupInvitation>(`${environment.apiUrl}/invitations/${id}/respond`, { accept }).pipe(timeout(15_000), finalize(() => this.responding.delete(id))))
      .subscribe({
        next: () => {
          this._invitations.update(list => list.filter(i => i.id !== id));
        },
        error: () => {
          this._respondError.set(
            'Não foi possível confirmar a resposta ao convite. Atualize a lista antes de tentar novamente.'
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

  connectSSE(): void { if (this.wanted) return; this.wanted = true; this.syncStream(); }
  disconnectSSE(): void { this.wanted = false; this.stopStream(); }

  private stopStream(): void {
    this.stream?.stop(); this.stream = null; this._streamStatus.set('stopped');
  }
  private syncStream(): void {
    this.stopStream();
    if (!this.wanted) return;
    const token = this.session.getToken(), user = this.session.user();
    if (!token || !user) return;
    const version = this.session.version();
    try {
      const stream: InvitationStream = new InvitationStream(this.browser, environment.apiUrl, document.baseURI, user.id,
        () => this.stream === stream && this.session.version() === version ? this.session.getToken() : null,
        this.createSource,
        payload => {
          if (this.stream !== stream || this.session.version() !== version || !this.session.isAuthenticated()) return;
          if (this._loading()) this.reloadAfterEvent = true;
          else this.loadInvitations();
          this.showToast(payload);
        }, status => { if (this.stream === stream) this._streamStatus.set(status); },
        () => { if (this.stream === stream && this.session.isAuthenticated()) this.loadInvitations(); });
      this.stream = stream; stream.start();
    } catch { this._streamStatus.set('unavailable'); }
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  private showToast(payload: SseInvitationToast): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this._sseToast.set(payload);
    this.toastTimer = setTimeout(() => this.dismissToast(), 6000);
  }
}
