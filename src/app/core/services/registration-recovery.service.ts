import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, finalize } from 'rxjs';
import { SessionService } from './session.service';

type Resource = 'pockets' | 'cards';
type RecoveryState = 'clear' | 'pending' | 'checking' | 'review';

/** Keep uncertain writes blocked across navigation until the user reviews a fresh list. */
@Injectable({ providedIn: 'root' })
export class RegistrationRecoveryService {
  readonly pockets = signal<RecoveryState>('clear');
  readonly cards = signal<RecoveryState>('clear');
  private readonly session = inject(SessionService);

  constructor() {
    this.session.registerCleanup(() => {
      this.pockets.set('clear');
      this.cards.set('clear');
    }, inject(DestroyRef));
  }

  mark(resource: Resource): void { this[resource].set('pending'); }

  check(resource: Resource, load: () => Observable<unknown>): void {
    if (this[resource]() === 'checking') return;
    const version = this.session.version();
    this[resource].set('checking');
    load().pipe(finalize(() => {
      if (version === this.session.version() && this[resource]() === 'checking') this[resource].set('pending');
    })).subscribe({
      next: () => { if (version === this.session.version()) this[resource].set('review'); },
      error: () => {},
    });
  }

  confirm(resource: Resource): void {
    if (this[resource]() === 'review') this[resource].set('clear');
  }
}
