import { redemptionNet } from './investment-redemption.util';
import { investmentPrecisionScenario } from '../testing/investment-baseline.fixture';

describe('legacy redemption decimal baseline', () => {
  it.each([
    [1100, 15, 1085], [1100, 0, 1100], [1100, 1100, 0],
    [0.30, 0.20, 0.10], [15.12345678, 0.12345678, 15],
  ])('previews gross %s minus tax %s as %s', (gross, tax, net) => {
    expect(redemptionNet(gross, tax)).toBe(net);
  });
});

// S15 is reserved for the separate V2 domain/HTTP implementation, not the numeric legacy API.
describe('future investment V2 domain acceptance (INV-004)', () => {
  it.todo(`preserves ID ${investmentPrecisionScenario.id} and quantity ${investmentPrecisionScenario.quantity} through forms, selectors and HTTP as strings`);
  it.todo(`subtracts ${investmentPrecisionScenario.grossAmount} - ${investmentPrecisionScenario.withheldTax} as the exact decimal string ${investmentPrecisionScenario.netAmount}`);
});
