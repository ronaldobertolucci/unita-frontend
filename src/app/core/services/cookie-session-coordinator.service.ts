import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import { CoordinationBrowser, CookieSessionCoordinatorEngine } from '../auth/session-coordinator';
import { environment } from '../../../environments/environment';

export const COORDINATION_BROWSER = new InjectionToken<CoordinationBrowser>('Unita session browser', {
  providedIn: 'root', factory: () => ({
    secure: window.isSecureContext === true,
    locks: navigator.locks,
    read: key => localStorage.getItem(key),
    write: (key, value) => localStorage.setItem(key, value),
    id: () => crypto.randomUUID(),
    channel: name => typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name),
    listen: callback => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    }
  })
});

@Injectable({ providedIn: 'root' })
export class CookieSessionCoordinator extends CookieSessionCoordinatorEngine {
  constructor() {
    super(inject(COORDINATION_BROWSER), environment.apiUrl, document.baseURI);
    inject(DestroyRef).onDestroy(() => this.dispose());
  }
}
