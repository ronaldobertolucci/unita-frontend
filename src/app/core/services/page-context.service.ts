import { Injectable, signal, inject, DestroyRef } from '@angular/core';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class PageContextService {
  private readonly session = inject(SessionService);
  private readonly sessionCleanup = this.session.registerCleanup(() => { this.clear(); }, inject(DestroyRef));

  readonly pageSubtitle  = signal<string | null>(null);
  readonly summaryDisplay = signal<string | null>(null);
  readonly ctaLabel      = signal<string | null>(null);
  readonly ctaCallback   = signal<(() => void) | null>(null);

  clear(): void {
    this.pageSubtitle.set(null);
    this.summaryDisplay.set(null);
    this.ctaLabel.set(null);
    this.ctaCallback.set(null);
  }
}