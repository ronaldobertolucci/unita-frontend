import { DOCUMENT, Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { ParamMap } from '@angular/router';
import { isRecord } from './auth-contract';

declare global { interface Window { __UNITA_AUTH_LINK__?: unknown; } }
export interface LinkToken { token: string | null; provided: boolean; cleaned: boolean; }

export function parseLinkTokens(tokens: readonly unknown[], cleaned: boolean): LinkToken {
  return { provided: tokens.length > 0, cleaned,
    token: cleaned && tokens.length === 1 && typeof tokens[0] === 'string' && tokens[0].trim() ? tokens[0] : null };
}

@Injectable({ providedIn: 'root' })
export class LinkTokenService {
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private initial: unknown = this.document.defaultView?.__UNITA_AUTH_LINK__;
  constructor() { if (this.document.defaultView) delete this.document.defaultView.__UNITA_AUTH_LINK__; }

  take(path: '/verify-email' | '/reset-password', params: ParamMap): LinkToken {
    const initial = this.initial; this.initial = undefined;
    if (!params.has('token') && isRecord(initial) && initial['path'] === path && Array.isArray(initial['tokens'])) {
      return parseLinkTokens(initial['tokens'], initial['cleaned'] === true);
    }
    const tokens = params.getAll('token');
    let cleaned = false;
    try {
      const url = new URL(this.document.URL);
      // Use route parameters as the authority, preserve only non-token query.
      const query = new URLSearchParams();
      for (const key of params.keys) if (key !== 'token') for (const value of params.getAll(key)) query.append(key, value);
      this.location.replaceState(path, query.toString());
      cleaned = !url.username && !url.password;
    } catch { /* No consuming request if history cannot be sanitized. */ }
    return parseLinkTokens(tokens, cleaned);
  }
}
