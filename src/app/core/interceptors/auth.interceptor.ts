import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import { catchError, from, of, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { AUTH_SESSION_OPTIONS, classifyAuthRequest } from '../auth/auth-request-policy';
import { classifyAuthError } from '../auth/auth-errors';
import { environment } from '../../../environments/environment';

export const AUTH_RECOVERY_ATTEMPTED = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const kind = classifyAuthRequest(req.url, req.method, environment.apiUrl, inject(DOCUMENT).baseURI);
  if (kind === 'session') return next(req.clone({
    withCredentials: true,
    headers: req.headers.delete('Authorization').set('X-CSRF-Protection', AUTH_SESSION_OPTIONS.headers['X-CSRF-Protection'])
  }));
  if (kind !== 'protected') return next(req);
  const session = inject(SessionService);
  const auth = inject(AuthService);
  // Observe expiry before capturing the context of this new demand.
  const currentToken = auth.getToken();
  const hadAccess = !!currentToken;
  const version = session.version();
  let attempted = req.context.get(AUTH_RECOVERY_ATTEMPTED) || !hadAccess;
  let sentToken: string;
  const financialWrite =
    (req.method === 'POST' && /\/(transfers(?:\/fgts\/withdrawal)?|pockets\/\d+\/transactions)$/.test(req.url.split('?')[0])) ||
    (req.method === 'PUT' && /\/credit-cards\/\d+\/bills\/\d+\/pay$/.test(req.url.split('?')[0])) ||
    (req.method === 'DELETE' && /\/(pockets\/\d+\/transactions\/\d+|pockets\/(bank-accounts|benefit-accounts|fgts)\/\d+|credit-cards\/\d+)$/.test(req.url.split('?')[0]));
  const send = (token: string) => {
    sentToken = token;
    return next(req.clone({
      context: req.context.set(AUTH_RECOVERY_ATTEMPTED, attempted),
      setHeaders: { Authorization: `Bearer ${token}` }
    }));
  };
  return session.scoped(() => (currentToken ? of(currentToken) : from(auth.accessToken(version))).pipe(
    switchMap(send),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !classifyAuthError('protected', error).canRecoverSession) {
        return throwError(() => error);
      }
      if (attempted) {
        auth.endRecovery();
        return throwError(() => error);
      }
      attempted = true;
      // Recover access, but US-02 financial writes always require a new user action.
      return from(auth.accessToken(version, sentToken)).pipe(
        switchMap(token => financialWrite ? throwError(() => error) : send(token)),
        catchError(repeated => {
          if (financialWrite && repeated === error) return throwError(() => error);
          if (repeated instanceof HttpErrorResponse && classifyAuthError('protected', repeated).canRecoverSession) auth.endRecovery();
          return throwError(() => repeated);
        }),
      );
    })
  ));
};
