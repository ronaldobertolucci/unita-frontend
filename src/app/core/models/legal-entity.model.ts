// ─── Pessoa Jurídica ─────────────────────────────────────────────────────────

export interface LegalEntityDto {
  id: number;
  cnpj: string;
  corporateName: string;
  tradeName: string | null;
  stateRegistration: string | null;
}

export interface CreateLegalEntityPayload {
  cnpj: string;
  corporateName: string;
  tradeName?: string;
  stateRegistration?: string;
}

export interface UpdateLegalEntityPayload {
  cnpj: string;
  corporateName: string;
  tradeName?: string;
  stateRegistration?: string;
}

// ─── Empregador Pessoa Física ─────────────────────────────────────────────────

export interface IndividualEmployerDto {
  id: number;
  cpf: string;
  name: string;
}

export interface CreateIndividualEmployerPayload {
  cpf: string;
  name: string;
}

export interface UpdateIndividualEmployerPayload {
  cpf: string;
  name: string;
}

// ─── Empregador Pessoa Jurídica ───────────────────────────────────────────────

export interface LegalEntityEmployerDto {
  id: number;
  legalEntity: {
    id: number;
    cnpj: string;
    corporateName: string;
    tradeName: string | null;
    stateRegistration: string | null;
  };
}

export interface CreateLegalEntityEmployerPayload {
  legalEntityId: number;
}

export interface UpdateLegalEntityEmployerPayload {
  legalEntityId: number;
}