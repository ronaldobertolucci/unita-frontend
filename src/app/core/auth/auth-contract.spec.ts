import { AuthContractError, parseActiveUser, parseEmptyAuthSuccess, parseMessageResponse, parseSession, parseUser, sessionExpiresAt } from './auth-contract';

const user = {
  id: 1, firstName: 'Nome', lastName: 'Sobrenome', email: 'user@example.com',
  dateOfBirth: '1990-01-01', enabled: true, emailVerified: true, roles: ['USER']
};
const session = { token: 'synthetic-access-token', type: 'Bearer', expiresIn: 120, user };

describe('Unita authentication contract', () => {
  it('parses the actual Unita fields and does not retain arbitrary/private fields', () => {
    const result = parseSession({ ...session, refreshToken: 'must-not-be-copied', user: { ...user, password: 'must-not-be-copied' } });
    expect(result).toEqual(session);
    expect(result.user.roles).not.toBe(user.roles);
    expect(result).not.toHaveProperty('refreshToken');
    expect(result.user).not.toHaveProperty('password');
  });

  it('accepts a pending or disabled user DTO but rejects either for a session', () => {
    for (const fields of [{ enabled: true, emailVerified: false }, { enabled: false, emailVerified: true }, { enabled: false, emailVerified: false }]) {
      const value = { ...user, ...fields };
      expect(parseUser(value)).toEqual(value);
      expect(() => parseActiveUser(value)).toThrow(AuthContractError);
      expect(() => parseSession({ ...session, user: value })).toThrow(AuthContractError);
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined])('rejects unsafe or nonnumeric IDs: %s', id => {
    expect(() => parseUser({ ...user, id })).toThrow(AuthContractError);
  });

  it.each([
    null, [], {}, { ...user, firstName: ' ' }, { ...user, lastName: 42 },
    { ...user, email: null }, { ...user, dateOfBirth: '1990-02-30' },
    { ...user, dateOfBirth: '01/01/1990' }, { ...user, dateOfBirth: '1990-01-01T00:00:00Z' },
    { ...user, enabled: 'true' }, { ...user, emailVerified: undefined },
    { ...user, roles: 'USER' }, { ...user, roles: ['USER', null] }, { ...user, roles: [' '] },
    { ...user, roles: new Array(1) }
  ])('rejects malformed user DTOs', value => {
    expect(() => parseUser(value)).toThrow(AuthContractError);
  });

  it('accepts real leap dates and string roles without assuming a closed role list', () => {
    expect(parseUser({ ...user, dateOfBirth: '2000-02-29', roles: ['USER', 'ADMIN', 'AUDITOR'] }).roles).toEqual(['USER', 'ADMIN', 'AUDITOR']);
    expect(() => parseUser({ ...user, dateOfBirth: '1900-02-29' })).toThrow(AuthContractError);
    expect(parseUser({ ...user, roles: [] }).roles).toEqual([]);
  });

  it.each([
    null, [], {}, { ...session, token: '' }, { ...session, token: ' ' },
    { ...session, token: 'token\nheader' }, { ...session, type: 'bearer' },
    { token: session.token, tokenType: 'Bearer', expiresIn: 120, user },
    { ...session, user: undefined }
  ])('rejects malformed sessions, including a different project contract', value => {
    expect(() => parseSession(value)).toThrow(AuthContractError);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '7200', null, undefined])('rejects invalid lifetimes: %s', expiresIn => {
    expect(() => parseSession({ ...session, expiresIn })).toThrow(AuthContractError);
  });

  it('uses the response lifetime in seconds and rejects deadline overflow', () => {
    expect(sessionExpiresAt(120, 1_000)).toBe(121_000);
    expect(sessionExpiresAt(3600, 1_000)).toBe(3_601_000);
    expect(() => sessionExpiresAt(1, Number.MAX_SAFE_INTEGER)).toThrow(AuthContractError);
    expect(() => sessionExpiresAt(1, NaN)).toThrow(AuthContractError);
    expect(() => sessionExpiresAt(1, 8_640_000_000_000_000)).toThrow(AuthContractError);
  });

  it('accepts empty confirmation/resend 200 and logout 204 without inventing a JSON response', () => {
    for (const status of [200, 204] as const) {
      for (const body of [null, undefined, '']) {
        expect(() => parseEmptyAuthSuccess({ status, body }, status)).not.toThrow();
      }
      expect(() => parseEmptyAuthSuccess({ status, body: {} }, status)).toThrow(AuthContractError);
      expect(() => parseEmptyAuthSuccess({ status, body: 'success' }, status)).toThrow(AuthContractError);
    }
    expect(() => parseEmptyAuthSuccess({ status: 200, body: null }, 204)).toThrow(AuthContractError);
    expect(() => parseEmptyAuthSuccess({ status: 204, body: null }, 200)).toThrow(AuthContractError);
    expect(() => parseEmptyAuthSuccess(null, 200)).toThrow(AuthContractError);
  });

  it('validates password endpoint message DTOs, independently of UI translations', () => {
    expect(parseMessageResponse({ message: 'Token is valid', internal: 'discard' })).toEqual({ message: 'Token is valid' });
    for (const value of [null, '', {}, [], { message: '' }, { message: ' ' }, { message: 200 }]) {
      expect(() => parseMessageResponse(value)).toThrow(AuthContractError);
    }
  });
});
