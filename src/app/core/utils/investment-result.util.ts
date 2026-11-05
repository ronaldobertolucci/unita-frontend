import { redemptionNet } from './investment-redemption.util';

interface InvestmentTotals {
  currentValue: number;
  redeemedValue: number;
  totalInvested: number;
}

/** Simple cumulative result, including receipts; not realized profit or annualized return. */
export function investmentResult(position: InvestmentTotals): number {
  return redemptionNet(redemptionNet(position.currentValue, -position.redeemedValue), position.totalInvested);
}

export function investmentVariation(position: InvestmentTotals): number | null {
  return position.totalInvested > 0 ? investmentResult(position) / position.totalInvested * 100 : null;
}
