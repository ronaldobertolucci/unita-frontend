import { translateApiError } from './api-error.util';

describe('translateApiError', () => {

  describe('known messages — groups and invitations', () => {
    it('should translate User not found', () => {
      expect(translateApiError('User not found')).toBe(
        'Usuário não encontrado. Verifique o e-mail informado.'
      );
    });

    it('should translate User is already a member', () => {
      expect(translateApiError('User is already a member')).toBe(
        'Este usuário já é membro do grupo.'
      );
    });

    it('should translate User already has a pending invitation', () => {
      expect(translateApiError('User already has a pending invitation')).toBe(
        'Este usuário já possui um convite pendente.'
      );
    });

    it('should translate Invitation not found', () => {
      expect(translateApiError('Invitation not found')).toBe('Convite não encontrado.');
    });

    it('should translate Group not found', () => {
      expect(translateApiError('Group not found')).toBe('Grupo não encontrado.');
    });

    it('should translate Only members can invite', () => {
      expect(translateApiError('Only members can invite')).toBe('Apenas membros podem convidar.');
    });
  });

  describe('known messages — legal entities', () => {
    it('should translate Legal entity is in use and cannot be deleted', () => {
      expect(translateApiError('Legal entity is in use and cannot be deleted')).toBe(
        'Esta empresa está em uso e não pode ser excluída.'
      );
    });

    it('should translate A legal entity with this CNPJ already exists', () => {
      expect(translateApiError('A legal entity with this CNPJ already exists')).toBe(
        'Já existe uma empresa cadastrada com este CNPJ.'
      );
    });
  });

  describe('known messages — employers', () => {
    it('should translate Employer is in use and cannot be deleted', () => {
      expect(translateApiError('Employer is in use and cannot be deleted')).toBe(
        'Este empregador está em uso e não pode ser excluído.'
      );
    });

    it('should translate An employer for this legal entity already exists', () => {
      expect(translateApiError('An employer for this legal entity already exists')).toBe(
        'Já existe um empregador cadastrado para esta empresa.'
      );
    });

    it('should translate An employer with this CPF already exists', () => {
      expect(translateApiError('An employer with this CPF already exists')).toBe(
        'Já existe um empregador cadastrado com este CPF.'
      );
    });
  });

  describe('fallback behavior', () => {
    it('should return the original message when not in the map', () => {
      expect(translateApiError('Some unknown error')).toBe('Some unknown error');
    });

    it('should return default fallback when message is undefined', () => {
      expect(translateApiError(undefined)).toBe('Ocorreu um erro. Tente novamente.');
    });

    it('should return custom fallback when message is undefined and fallback is provided', () => {
      expect(translateApiError(undefined, 'Erro customizado')).toBe('Erro customizado');
    });

    it('should return custom fallback when message is undefined even with known-like text', () => {
      expect(translateApiError(undefined, 'Erro ao salvar.')).toBe('Erro ao salvar.');
    });
  });
});