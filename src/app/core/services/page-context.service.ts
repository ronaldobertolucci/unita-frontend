import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PageContextService {
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