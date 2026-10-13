import { LoginResponse, MessageResponse } from '../models/auth.model';
import { UserDto } from '../models/user.model';

export class AuthContractError extends Error {
  constructor() {
    super('A API retornou uma resposta de autenticação inválida.');
    this.name = 'AuthContractError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseRegisteredUser(response: unknown): UserDto {
  if (!isRecord(response) || response['status'] !== 201) throw new AuthContractError();
  const user = parseUser(response['body']);
  if (!user.enabled || user.emailVerified) throw new AuthContractError();
  return user;
}

export function parseAuthMessageSuccess(response: unknown): MessageResponse {
  if (!isRecord(response) || response['status'] !== 200) throw new AuthContractError();
  return parseMessageResponse(response['body']);
}

/** Parse the DTO independently of whether this user is allowed to sign in. */
export function parseUser(value: unknown): UserDto {
  if (!isRecord(value) || typeof value['id'] !== 'number' ||
      !Number.isSafeInteger(value['id']) || value['id'] <= 0 ||
      !nonBlank(value['firstName']) || !nonBlank(value['lastName']) ||
      !nonBlank(value['email']) || !calendarDate(value['dateOfBirth']) ||
      typeof value['enabled'] !== 'boolean' || typeof value['emailVerified'] !== 'boolean' ||
      !Array.isArray(value['roles']) || ![...value['roles']].every(nonBlank)) {
    throw new AuthContractError();
  }
  // Select public fields; do not carry arbitrary response properties into state.
  return {
    id: value['id'], firstName: value['firstName'], lastName: value['lastName'],
    email: value['email'], dateOfBirth: value['dateOfBirth'],
    enabled: value['enabled'], emailVerified: value['emailVerified'],
    roles: [...value['roles']]
  };
}

export function parseActiveUser(value: unknown): UserDto {
  const user = parseUser(value);
  if (!user.enabled || !user.emailVerified) throw new AuthContractError();
  return user;
}

/** Seconds from the API, never a fixed token lifetime or a JWT claim. */
export function sessionExpiresAt(expiresIn: number, now = Date.now()): number {
  const deadline = now + expiresIn * 1000;
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0 ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(deadline) ||
      Math.abs(deadline) > 8_640_000_000_000_000 || deadline <= now) {
    throw new AuthContractError();
  }
  return deadline;
}

export function parseSession(value: unknown): LoginResponse {
  if (!isRecord(value) || !nonBlank(value['token']) || /\s/.test(value['token']) ||
      value['type'] !== 'Bearer' || typeof value['expiresIn'] !== 'number') {
    throw new AuthContractError();
  }
  sessionExpiresAt(value['expiresIn']);
  return {
    token: value['token'], type: 'Bearer', expiresIn: value['expiresIn'],
    user: parseActiveUser(value['user'])
  };
}

export function parseMessageResponse(value: unknown): MessageResponse {
  if (!isRecord(value) || !nonBlank(value['message'])) throw new AuthContractError();
  return { message: value['message'] };
}

/** Use observe: 'response'; empty 200/204 is success, not a missing JSON DTO. */
export function parseEmptyAuthSuccess(response: unknown, expectedStatus: 200 | 204): void {
  if (!isRecord(response) || response['status'] !== expectedStatus ||
      response['body'] !== null && response['body'] !== undefined && response['body'] !== '') {
    throw new AuthContractError();
  }
}
