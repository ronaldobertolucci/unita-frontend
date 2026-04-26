export type PocketType = 'BANK_ACCOUNT' | 'BENEFIT_ACCOUNT' | 'FGTS_EMPLOYER_ACCOUNT' | 'CASH';
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

// ─── Resumo (listagem) ───────────────────────────────────────────────────────

export interface PocketSummaryDto {
  id: number;
  type: PocketType;
  label: string;
  active: boolean;
  balance: number;
}

// ─── Detalhes por tipo ───────────────────────────────────────────────────────

export interface BankAccountDto {
  id: number;
  legalEntityCorporateName: string;
  number: string;
  agency: string;
  bankAccountType: string;
  status: AccountStatus;
}

export interface BenefitAccountDto {
  id: number;
  legalEntityCorporateName: string;
  benefitType: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface FgtsEmployerAccountDto {
  id: number;
  employerName: string;
  admissionDate: string;
  dismissalDate: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface CashDto {
  id: number;
  balance: number;
}

// ─── Dados de referência ─────────────────────────────────────────────────────

export interface BankAccountTypeDto {
  id: number;
  name: string;
}

export interface BenefitTypeDto {
  id: number;
  name: string;
}

export interface LegalEntityDto {
  id: number;
  cnpj: string;
  corporateName: string;
  tradeName: string | null;
  stateRegistration: string | null;
}

export interface IndividualEmployerDto {
  id: number;
  cpf: string;
  name: string;
}

export interface LegalEntityEmployerDto {
  id: number;
  legalEntity: {
    id: number;
    cnpj: string;
    corporateName: string;
  };
}

export type AnyEmployerDto = IndividualEmployerDto | LegalEntityEmployerDto;

// ─── Payloads de criação ─────────────────────────────────────────────────────

export interface CreateBankAccountPayload {
  legalEntityId: number;
  number: string;
  agency: string;
  bankAccountTypeId: number;
  status?: AccountStatus;
}

export interface CreateBenefitAccountPayload {
  legalEntityId: number;
  benefitTypeId: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface CreateFgtsPayload {
  employerId: number;
  admissionDate: string;
  dismissalDate?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

// ─── Payloads de edição ──────────────────────────────────────────────────────

export interface UpdateBankAccountPayload {
  status: AccountStatus;
}

export interface UpdateBenefitAccountPayload {
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateFgtsPayload {
  dismissalDate?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}