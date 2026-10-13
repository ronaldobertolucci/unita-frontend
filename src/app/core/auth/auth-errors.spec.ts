import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { AuthEndpoint, authFieldErrors, authRetryAfterSeconds, classifyAuthError, readAuthApiError } from './auth-errors';

const failure = (status: number, error: unknown) => ({ status, error });

describe('Unita authentication error decisions', () => {
  it.each(['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'SESSION_EXPIRED'])('recovers only a known protected-resource 401: %s', code => {
    const error = failure(401, { status: 401, code });
    expect(classifyAuthError('protected', error).canRecoverSession).toBe(true);
    for (const endpoint of ['login', 'refresh', 'logout', 'register', 'verify-email', 'resend-verification', 'forgot-password', 'reset-validate', 'reset-password'] as AuthEndpoint[]) {
      expect(classifyAuthError(endpoint, error).canRecoverSession).toBe(false);
    }
  });

  it.each([
    failure(401, null), failure(401, { message: 'Unauthorized' }),
    failure(401, { code: 'REFRESH_REJECTED' }), failure(401, { code: 'UNKNOWN' }),
    failure(403, { code: 'SESSION_EXPIRED' }), failure(429, { code: 'SESSION_EXPIRED' }),
    failure(0, { code: 'SESSION_EXPIRED' }), failure(500, { code: 'SESSION_EXPIRED' }),
    failure(200, { status: 401, code: 'SESSION_EXPIRED' }),
    { error: { status: 401, code: 'SESSION_EXPIRED' } }
  ])('does not infer refresh from status, message, foreign code or envelope status', error => {
    expect(classifyAuthError('protected', error).canRecoverSession).toBe(false);
  });

  it.each([
    ['login', 401, { message: 'Invalid email or password' }, 'credentials'],
    ['login', 403, { code: 'EMAIL_NOT_VERIFIED' }, 'email-not-verified'],
    ['login', 403, { code: 'ACCOUNT_DISABLED' }, 'account-disabled'],
    ['login', 403, { code: 'CSRF_PROTECTION_REQUIRED' }, 'csrf'],
    ['refresh', 403, { code: 'CSRF_PROTECTION_REQUIRED' }, 'csrf'],
    ['logout', 403, { code: 'CSRF_PROTECTION_REQUIRED' }, 'csrf'],
    ['refresh', 401, { code: 'SESSION_EXPIRED' }, 'session-expired'],
    ['protected', 403, { code: 'ACCESS_DENIED' }, 'access-denied'],
    ['register', 400, { message: 'Email already registered' }, 'email-registered'],
    ['verify-email', 400, { error: 'Bad Request', message: 'Invalid verification token' }, 'invalid-link'],
    ['verify-email', 409, { error: 'Conflict', message: 'Token has already been used' }, 'used-link'],
    ['verify-email', 409, { error: 'Conflict', message: 'Token has expired' }, 'expired-link'],
    ['reset-validate', 400, { error: 'Invalid Token', message: 'Invalid token' }, 'invalid-link'],
    ['reset-password', 400, { error: 'Invalid Token', message: 'Token expired or already used' }, 'invalid-link'],
    ['reset-password', 400, { error: 'Validation Failed', errors: [{ field: 'newPassword', message: 'internal' }] }, 'validation']
  ] as const)('recognizes %s %s with the documented envelope', (endpoint, status, body, kind) => {
    const result = classifyAuthError(endpoint, failure(status, body));
    expect(result.kind).toBe(kind);
    expect(result.canRecoverSession).toBe(false);
  });

  it.each([
    ['resend-verification', 409, { error: 'Conflict', message: 'Token has already been used' }],
    ['verify-email', 400, { error: 'Invalid Token', message: 'Invalid token' }],
    ['reset-password', 400, { error: 'Bad Request', message: 'Invalid verification token' }],
    ['verify-email', 409, { message: 'Token has expired' }],
    ['register', 400, { message: 'Other input error' }],
    ['login', 403, { code: 'ACCESS_DENIED' }],
    ['protected', 403, { code: 'EMAIL_NOT_VERIFIED' }]
  ] as const)('does not apply another endpoint or undocumented envelope contract to %s', (endpoint, status, body) => {
    expect(classifyAuthError(endpoint, failure(status, body)).kind).toBe('unknown');
  });

  it('does not announce confirmed account from the obsolete resend 409', () => {
    const result = classifyAuthError('resend-verification', failure(409, { message: 'Already verified' }));
    expect(result.kind).toBe('unknown');
    expect(result.message).not.toContain('Already verified');
  });

  it.each([null, undefined, '', 'bad gateway <html>', [], { errors: null, details: null }, { code: 401, message: { stack: 'secret' } }])('handles heterogeneous unknown bodies without rendering them', body => {
    expect(() => readAuthApiError(failure(400, body))).not.toThrow();
    const result = classifyAuthError('reset-password', failure(400, body));
    expect(result.kind).toBe('unknown');
    expect(result.message).toBe('Não foi possível concluir a solicitação. O resultado não foi confirmado.');
  });

  it('accepts a JSON error body as text and trusts the actual HTTP status', () => {
    expect(classifyAuthError('refresh', failure(401, '{"code":"SESSION_EXPIRED"}')).kind).toBe('session-expired');
    expect(classifyAuthError('refresh', failure(502, '{"status":401,"code":"SESSION_EXPIRED"}')).kind).toBe('server');
  });

  it('associates only known fields using errors[], independent of order or server messages', () => {
    const error = failure(400, { error: 'Validation Failed', details: ['email: guessed error'], errors: [
      { field: 'newPassword', message: 'arbitrary internal text' }, { field: 'unknown', message: 'secret' },
      null, { field: 123 }, { field: '' }, { field: 'email', message: null }
    ] });
    expect(authFieldErrors(error, { email: 'Confira seu e-mail.', newPassword: 'Confira sua nova senha.' }))
      .toEqual({ email: 'Confira seu e-mail.', newPassword: 'Confira sua nova senha.' });
    expect(authFieldErrors(failure(400, { error: 'Invalid Token', errors: [{ field: 'newPassword' }] }), { newPassword: 'Confira.' })).toEqual({});
    expect(authFieldErrors(failure(400, { error: 'Validation Failed', errors: null, details: ['email: invalid'] }), { email: 'Confira.' })).toEqual({});
  });

  it('distinguishes transport and server uncertainty from credential rejection', () => {
    expect(classifyAuthError('login', failure(0, null)).kind).toBe('network');
    expect(classifyAuthError('login', failure(503, { message: 'database password leaked' })).kind).toBe('server');
    expect(classifyAuthError('login', failure(503, { message: 'database password leaked' })).message).not.toContain('database');
    expect(readAuthApiError({ status: '401', error: { code: 'INVALID_TOKEN' } }).status).toBeNull();
  });
});

describe('server Retry-After hint', () => {
  const error = (value?: string, status = 429) => new HttpErrorResponse({ status,
    headers: new HttpHeaders(value === undefined ? {} : { 'Retry-After': value }) });
  it('uses supplied seconds, with no invented cooldown', () => {
    expect(authRetryAfterSeconds(error('30'))).toBe(30);
    expect(authRetryAfterSeconds(error('0'))).toBe(0);
    expect(authRetryAfterSeconds(error())).toBeNull();
    expect(authRetryAfterSeconds(error('30', 500))).toBeNull();
  });
  it('handles an HTTP date relative to the current time', () => {
    const now = Date.parse('Tue, 13 Oct 2026 12:00:00 GMT');
    expect(authRetryAfterSeconds(error('Tue, 13 Oct 2026 12:00:30 GMT'), now)).toBe(30);
    expect(authRetryAfterSeconds(error('Tue, 13 Oct 2026 11:59:30 GMT'), now)).toBe(0);
  });
  it.each(['-1', '1.5', 'later', '999999999999999999999', '2026-10-13'])('ignores malformed hints: %s', value => {
    expect(authRetryAfterSeconds(error(value))).toBeNull();
  });
});
