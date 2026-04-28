export type AssetCategory = 'RENDA_FIXA' | 'PREVIDENCIA';
export type AssetStatus = 'ACTIVE' | 'MATURED' | 'REDEEMED';
export type FixedIncomeIndexer = 'CDI' | 'IPCA' | 'SELIC' | 'PREFIXADO';
export type PensionType = 'PGBL' | 'VGBL' | 'ENTIDADE_FECHADA';
export type TaxRegime = 'PROGRESSIVO' | 'REGRESSIVO';
export type InvestmentTransactionType = 'BUY' | 'SELL' | 'YIELD' | 'TAX';

export interface AssetSummaryDto {
  id: number;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  legalEntityName: string;
  custodianLegalEntityName: string | null;
  currentValue: number;
  totalInvested: number;
  redeemedValue: number;
}

export interface AssetPositionDto {
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  currentValue: number;
  redeemedValue: number;
  lastValuationDate: string | null;
}

export interface FixedIncomeDetailsDto {
  indexer: FixedIncomeIndexer;
  annualRate: number;
  maturityDate: string;
  taxFree: boolean;
}

export interface PensionDetailsDto {
  pensionType: PensionType;
  taxRegime: TaxRegime;
}

export interface AssetDetailDto {
  id: number;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  legalEntity: {
    id: number;
    cnpj: string;
    corporateName: string;
    tradeName: string | null;
    stateRegistration: string | null;
  };
  custodianLegalEntity: {
    id: number;
    cnpj: string;
    corporateName: string;
    tradeName: string | null;
    stateRegistration: string | null;
  };
  position: AssetPositionDto;
  fixedIncomeDetails: FixedIncomeDetailsDto | null;
  pensionDetails: PensionDetailsDto | null;
}

export interface InvestmentTransactionDto {
  id: number;
  type: InvestmentTransactionType;
  amount: number;
  transactionDate: string;
  notes: string | null;
}

// ── Payloads de criação ──────────────────────────────────────────────────────

export interface CreateFixedIncomePayload {
  name: string;
  legalEntityId: number;
  indexer: FixedIncomeIndexer;
  annualRate: number;
  maturityDate: string;
  taxFree: boolean;
  custodianLegalEntityId: number | null;
}

export interface CreatePensionPayload {
  name: string;
  legalEntityId: number;
  pensionType: PensionType;
  taxRegime: TaxRegime;
  custodianLegalEntityId: number | null;
}

export interface UpdateAssetPayload {
  name?: string;
  legalEntityId?: number;
  custodianLegalEntityId: number | null;
}

export interface UpdatePositionPayload {
  currentValue: number;
  lastValuationDate: string;
}

// ── Payloads de transação ────────────────────────────────────────────────────

export interface BuyPayload {
  amount: number;
  quantity: number;
  pocketId: number;
  transactionDate: string;
  categoryId: number;
  notes?: string;
}

export interface YieldPayload {
  amount: number;
  pocketId: number;
  transactionDate: string;
  categoryId: number;
  notes?: string;
}

export interface SellPayload {
  grossAmount: number;
  taxAmount: number;
  quantity: number;
  pocketId: number;
  transactionDate: string;
  categoryId: number;
  notes?: string;
}