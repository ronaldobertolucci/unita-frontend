import { HttpErrorResponse } from '@angular/common/http';
import { translateApiError } from './api-error.util';

export const REGISTRATION_UNAVAILABLE = 'Cadastro indisponível. Atualize a seleção.';

export function isUnavailableRegistration(error: HttpErrorResponse, field: 'legalEntity' | 'employer'): boolean {
  return error.status === 404 && error.error?.message === (field === 'employer' ? 'Employer not found' : 'Legal entity not found');
}

export function isUncertainCreation(error: HttpErrorResponse): boolean {
  return error.status === 0 || error.status >= 500 || error.status === 408;
}

export function registrationErrorMessage(error: HttpErrorResponse, fallback: string): string {
  if (error.status === 400) {
    const labels: Record<string, string> = {
      legalEntityId: 'Empresa', employerId: 'Empregador', number: 'Número', agency: 'Agência',
      bankAccountTypeId: 'Tipo de conta', benefitTypeId: 'Tipo de benefício', cardBrandId: 'Bandeira',
      admissionDate: 'Data de admissão', dismissalDate: 'Data de desligamento',
      lastFourDigits: 'Últimos quatro caracteres', creditLimit: 'Limite de crédito', closingDay: 'Dia de fechamento', dueDay: 'Dia de vencimento',
    };
    const messages: string[] = [];
    for (const errors of [error.error?.errors, error.error?.details]) {
      if (Array.isArray(errors)) {
        for (const item of errors) {
          if (item && typeof item.field === 'string' && typeof item.message === 'string') {
            messages.push(`${labels[item.field] ?? item.field}: ${item.message}`);
          }
        }
      } else if (errors && typeof errors === 'object') {
        for (const [field, value] of Object.entries(errors)) {
          const values = Array.isArray(value) ? value : [value];
          for (const message of values) {
            if (typeof message === 'string') messages.push(`${labels[field] ?? field}: ${message}`);
          }
        }
      }
    }
    return messages.length ? `Corrija os campos: ${[...new Set(messages)].join('; ')}` : 'Dados inválidos. Confira os campos antes de enviar.';
  }
  const references: Record<string, string> = {
    'Bank account type not found': 'Tipo de conta indisponível. Atualize as referências pelo acesso permitido ou procure suporte.',
    'Benefit type not found': 'Tipo de benefício indisponível. Atualize as referências pelo acesso permitido ou procure suporte.',
    'Card brand not found': 'Bandeira indisponível. Atualize as referências pelo acesso permitido ou procure suporte.',
  };
  return references[error.error?.message] ?? translateApiError(error.error?.message, fallback);
}
