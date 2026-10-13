import { HttpErrorResponse } from '@angular/common/http';
import { isRecord } from './auth-contract';

export type AuthEndpoint = 'login' | 'refresh' | 'logout' | 'protected' | 'register' |
  'verify-email' | 'resend-verification' | 'forgot-password' | 'reset-validate' | 'reset-password';

export interface AuthApiError {
  status: number | null;
  code: string | null;
  error: string | null;
  message: string | null;
  fields: ReadonlySet<string>;
}

/** Normalize evidence; raw server text must not be rendered as UI feedback. */
export function readAuthApiError(error: unknown): AuthApiError {
  const status = isRecord(error) && typeof error['status'] === 'number' &&
    Number.isInteger(error['status']) && (error['status'] === 0 || error['status'] >= 100 && error['status'] <= 599)
    ? error['status'] : null;
  let body: unknown = isRecord(error) ? error['error'] : undefined;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const fields = new Set<string>();
  if (isRecord(body) && Array.isArray(body['errors'])) {
    for (const entry of body['errors']) {
      if (isRecord(entry) && typeof entry['field'] === 'string' && entry['field'].trim()) {
        fields.add(entry['field']);
      }
    }
  }
  const text = (key: string) => isRecord(body) && typeof body[key] === 'string' ? body[key] : null;
  return { status, code: text('code'), error: text('error'), message: text('message'), fields };
}

export function authFieldErrors(error: unknown, messages: Readonly<Record<string, string>>): Record<string, string> {
  const { status, error: envelope, fields } = readAuthApiError(error);
  if (status !== 400 || envelope !== 'Validation Failed') return {};
  return Object.fromEntries(Object.entries(messages).filter(([field]) => fields.has(field)));
}

export type AuthErrorKind = 'recoverable-auth' | 'session-expired' | 'credentials' |
  'email-not-verified' | 'account-disabled' | 'csrf' | 'access-denied' | 'email-registered' |
  'invalid-link' | 'expired-link' | 'used-link' | 'validation' | 'rate-limited' | 'network' | 'server' | 'unknown';

const MESSAGES: Record<AuthErrorKind, string> = {
  'recoverable-auth': 'Sua sessão precisa ser renovada.',
  'session-expired': 'Sua sessão expirou. Entre novamente para continuar.',
  credentials: 'E-mail ou senha inválidos.',
  'email-not-verified': 'Confirme seu e-mail antes de entrar. Você pode solicitar um novo link.',
  'account-disabled': 'Sua conta está desabilitada. Entre em contato com o suporte.',
  csrf: 'Não foi possível validar a proteção da solicitação. Verifique a configuração da aplicação.',
  'access-denied': 'Você não tem permissão para realizar esta ação.',
  'email-registered': 'Este e-mail já está cadastrado.',
  'invalid-link': 'O link é inválido. Solicite um novo link.',
  'expired-link': 'O link expirou. Solicite um novo link.',
  'used-link': 'Este link já foi utilizado. Volte ao login ou solicite um novo link.',
  validation: 'Confira os campos informados.',
  'rate-limited': 'Muitas solicitações. Aguarde antes de tentar novamente.',
  network: 'Não foi possível confirmar o resultado da solicitação. Verifique sua conexão.',
  server: 'Não foi possível confirmar o resultado da solicitação no servidor.',
  unknown: 'Não foi possível concluir a solicitação. O resultado não foi confirmado.'
};

export interface AuthErrorPresentation {
  kind: AuthErrorKind;
  message: string;
  canRecoverSession: boolean;
}

export function classifyAuthError(endpoint: AuthEndpoint, error: unknown): AuthErrorPresentation {
  const value = readAuthApiError(error);
  const { status, code, message } = value;
  let kind: AuthErrorKind = 'unknown';
  if (status === 0) kind = 'network';
  else if (status === 429) kind = 'rate-limited';
  else if (status !== null && status >= 500) kind = 'server';
  else if (status === 400 && value.error === 'Validation Failed') kind = 'validation';
  else if (status === 403 && code === 'CSRF_PROTECTION_REQUIRED' && ['login', 'refresh', 'logout'].includes(endpoint)) kind = 'csrf';
  else if (endpoint === 'protected' && status === 401 &&
      ['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'SESSION_EXPIRED'].includes(code ?? '')) kind = 'recoverable-auth';
  else if (endpoint === 'protected' && status === 403 && code === 'ACCESS_DENIED') kind = 'access-denied';
  else if (endpoint === 'refresh' && status === 401 && code === 'SESSION_EXPIRED') kind = 'session-expired';
  else if (endpoint === 'login') {
    if (status === 401 && !code && message === 'Invalid email or password') kind = 'credentials';
    else if (status === 403 && code === 'EMAIL_NOT_VERIFIED') kind = 'email-not-verified';
    else if (status === 403 && code === 'ACCOUNT_DISABLED') kind = 'account-disabled';
  } else if (endpoint === 'register' && status === 400 && message === 'Email already registered') kind = 'email-registered';
  else if (endpoint === 'verify-email') {
    if (status === 400 && value.error === 'Bad Request' && message === 'Invalid verification token') kind = 'invalid-link';
    else if (status === 409 && value.error === 'Conflict' && message === 'Token has already been used') kind = 'used-link';
    else if (status === 409 && value.error === 'Conflict' && message === 'Token has expired') kind = 'expired-link';
  } else if ((endpoint === 'reset-validate' || endpoint === 'reset-password') && status === 400 && value.error === 'Invalid Token') {
    if (message === 'Invalid token') kind = 'invalid-link';
    // The API combines expiry and consumption, so do not invent a specific cause.
    else if (message === 'Token expired or already used') {
      return { kind: 'invalid-link', message: 'O link expirou ou já foi utilizado. Solicite um novo link.', canRecoverSession: false };
    }
  }
  return { kind, message: MESSAGES[kind], canRecoverSession: kind === 'recoverable-auth' };
}

/** Optional server hint, without inventing a client cooldown. */
export function authRetryAfterSeconds(error: unknown, now = Date.now()): number | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429 || !Number.isFinite(now)) return null;
  const value = error.headers.get('Retry-After')?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  // HTTP dates include a weekday; reject arbitrary strings accepted by Date.parse.
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return null;
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}
