import { translateApiError } from './api-error.util';

describe('translateApiError', () => {
  it('should translate known API error messages to Portuguese', () => {
    expect(translateApiError('User not found')).toBe(
      'Usuário não encontrado. Verifique o e-mail informado.'
    );
    expect(translateApiError('User is already a member')).toBe(
      'Este usuário já é membro do grupo.'
    );
    expect(translateApiError('User already has a pending invitation')).toBe(
      'Este usuário já possui um convite pendente.'
    );
    expect(translateApiError('Group not found')).toBe('Grupo não encontrado.');
  });

  it('should return the original message when not in the map', () => {
    expect(translateApiError('Some unknown error')).toBe('Some unknown error');
  });

  it('should return default fallback when message is undefined', () => {
    expect(translateApiError(undefined)).toBe('Ocorreu um erro. Tente novamente.');
  });

  it('should return custom fallback when message is undefined and fallback is provided', () => {
    expect(translateApiError(undefined, 'Erro customizado')).toBe('Erro customizado');
  });
});