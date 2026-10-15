import {
  AssetDetailDto, AssetSummaryDto, BuyPayload, CreateFixedIncomePayload,
  CreatePensionPayload, InvestmentTransactionDto, SellPayload, YieldPayload,
} from '../models/asset.model';
import { PocketSummaryDto } from '../models/pocket.model';
import { TransactionDto } from '../models/transaction.model';

/**
 * Synthetic legacy HTTP fixtures (INV-001), aligned with legacy-baseline.sql in the API.
 * Factories isolate mutations between tests. Numeric fields deliberately retain the legacy
 * contract; the missing-position/invalid-institution audit cases belong to the API collector
 * and cannot be represented by a valid AssetDetailDto. No real accounts or credentials.
 */
export function investmentBaseline() {
  const issuer = {
    id: 92001, cnpj: '12345678000190', corporateName: 'Synthetic issuer A',
    tradeName: 'Issuer A', stateRegistration: null,
  };
  const custodian = {
    id: 92002, cnpj: '98765432000100', corporateName: 'Synthetic custodian A',
    tradeName: null, stateRegistration: 'SYNTHETIC',
  };
  const fixedIncome: AssetDetailDto = {
    id: 93002, name: 'S14 multiple buys and stale valuation', category: 'RENDA_FIXA',
    status: 'ACTIVE', liquidityType: 'NO_VENCIMENTO', legalEntity: issuer,
    // A valid readable detail; the SQL audit fixture separately covers broken FKs.
    custodianLegalEntity: custodian,
    position: {
      quantity: 5.12345678, averagePrice: 97.59036012, totalInvested: 500.12345678,
      currentValue: 550.87654321, redeemedValue: 12.34, lastValuationDate: '2025-12-31',
    },
    fixedIncomeDetails: { indexer: 'CDI', annualRate: 1.1, maturityDate: '2027-10-01', taxFree: false },
    pensionDetails: null,
  };
  const pension: AssetDetailDto = {
    id: 93003, name: 'S14 matured pension', category: 'PREVIDENCIA', status: 'MATURED',
    liquidityType: 'PREVIDENCIARIA', legalEntity: issuer, custodianLegalEntity: null,
    position: {
      quantity: 2, averagePrice: 100, totalInvested: 200, currentValue: 220,
      redeemedValue: 0, lastValuationDate: '2026-01-31',
    },
    fixedIncomeDetails: null, pensionDetails: { pensionType: 'VGBL', taxRegime: 'REGRESSIVO' },
  };
  const redeemed: AssetDetailDto = {
    id: 93001, name: 'S01 full redemption', category: 'RENDA_FIXA', status: 'REDEEMED',
    liquidityType: 'DIARIA', legalEntity: issuer, custodianLegalEntity: custodian,
    position: {
      quantity: 0, averagePrice: 0, totalInvested: 1000, currentValue: 0,
      redeemedValue: 1085, lastValuationDate: '2026-10-12',
    },
    fixedIncomeDetails: { indexer: 'PREFIXADO', annualRate: 0.1, maturityDate: '2026-10-01', taxFree: false },
    pensionDetails: null,
  };
  const transactions: InvestmentTransactionDto[] = [
    { id: 97004, type: 'BUY', amount: 200, transactionDate: '2026-03-01', notes: 'S14 first buy', pocketTransactionId: 95004 },
    { id: 97005, type: 'BUY', amount: 300.12345678, transactionDate: '2026-04-01', notes: 'S14 eight-decimal second buy', pocketTransactionId: 95005 },
    { id: 97006, type: 'YIELD', amount: 12.34, transactionDate: '2026-10-12', notes: 'S14 same-day yield', pocketTransactionId: 95006 },
    { id: 97007, type: 'YIELD', amount: 15.12345678, transactionDate: '2026-10-12', notes: 'S14 detached cash reference; keep original notes: "á"', pocketTransactionId: null },
    { id: 97008, type: 'SELL', amount: 5, transactionDate: '2026-10-12', notes: 'S14 ambiguous shared cash reference', pocketTransactionId: 95006 },
    { id: 97009, type: 'TAX', amount: 1, transactionDate: '2026-10-12', notes: 'S14 same-day tax is not paired by proximity', pocketTransactionId: null },
  ];
  const redemptionTransactions: InvestmentTransactionDto[] = [
    { id: 97001, type: 'BUY', amount: 1000, transactionDate: '2026-02-01', notes: 'S01 principal 1000', pocketTransactionId: 95002 },
    { id: 97002, type: 'SELL', amount: 1100, transactionDate: '2026-10-12', notes: 'S01 gross 1100; net cash 1085', pocketTransactionId: 95003 },
    { id: 97003, type: 'TAX', amount: 15, transactionDate: '2026-10-12', notes: 'S01 supplied tax; no explicit SELL link', pocketTransactionId: null },
  ];
  const pensionTransactions: InvestmentTransactionDto[] = [
    { id: 97010, type: 'BUY', amount: 200, transactionDate: '2026-01-31', notes: null, pocketTransactionId: null },
  ];
  const pocket: PocketSummaryDto = { id: 94001, type: 'CASH', label: 'Synthetic cash A', active: true, balance: 1612.46 };
  const cashTransactions: TransactionDto[] = [{
    id: 95003, amount: 1085, direction: 'INCOME', transactionDate: '2026-10-12',
    description: 'S01 net proceeds; withholding already deducted',
    category: { id: 41, name: 'Resgate de Investimento', type: 'INCOME', isSystem: true },
    operationType: 'UNLINKED', operationId: null, canDelete: true,
  }];
  const summaries: AssetSummaryDto[] = [fixedIncome, pension, redeemed].map(asset => ({
    id: asset.id, name: asset.name, category: asset.category, status: asset.status,
    legalEntityName: issuer.tradeName, custodianLegalEntityName: asset.custodianLegalEntity?.corporateName ?? null,
    currentValue: asset.position.currentValue, totalInvested: asset.position.totalInvested,
    redeemedValue: asset.position.redeemedValue,
  }));
  const fixedIncomeCreate: CreateFixedIncomePayload = {
    name: fixedIncome.name, legalEntityId: issuer.id, custodianLegalEntityId: custodian.id,
    indexer: 'CDI', annualRate: 1.1, maturityDate: '2027-10-01', taxFree: false, liquidityType: 'NO_VENCIMENTO',
  };
  const pensionCreate: CreatePensionPayload = {
    name: pension.name, legalEntityId: issuer.id, custodianLegalEntityId: null,
    pensionType: 'VGBL', taxRegime: 'REGRESSIVO',
  };
  const buy: BuyPayload = { amount: 97.59036012, quantity: 2, pocketId: pocket.id, categoryId: 39,
    transactionDate: '2026-04-01', notes: 'Preço unitário legado; não multiplicar no cliente' };
  const yieldPayload: YieldPayload = { amount: 12.34, pocketId: pocket.id, categoryId: 40,
    transactionDate: '2026-10-12', notes: 'Rendimento manual: "á"' };
  const sell: SellPayload = { grossAmount: 1100, taxAmount: 15, pocketId: pocket.id, categoryId: 41,
    transactionDate: '2026-10-12', notes: 'S01 gross 1100; net cash 1085' };
  return { fixedIncome, pension, redeemed, transactions, redemptionTransactions, pensionTransactions, summaries,
    pocket, cashTransactions, fixedIncomeCreate, pensionCreate, buy, yieldPayload, sell };
}

// Future V2 domain acceptance inputs (S15); never coerce these into the numeric legacy DTOs.
export const investmentPrecisionScenario = {
  id: '9007199254740993', quantity: '0.000000000000000001',
  grossAmount: '0.30', withheldTax: '0.20', netAmount: '0.10',
} as const;
