import { investmentResult, investmentVariation } from './investment-result.util';

describe('shared cumulative investment result', () => {
  it.each([
    [2200, 1040, 3000, 240, 8],
    [2100, 1140, 3000, 240, 8],
    [0, 3120, 3000, 120, 4],
    [2000, 500, 3000, -500, -100 / 6],
    [100, 50, 0, 150, null],
    [0, 0, 0, 0, null],
  ])('uses value %s + receipts %s - contributions %s', (currentValue, redeemedValue, totalInvested, result, variation) => {
    const position = { currentValue: currentValue!, redeemedValue: redeemedValue!, totalInvested: totalInvested! };
    expect(investmentResult(position)).toBe(result);
    if (variation === null) expect(investmentVariation(position)).toBeNull();
    else expect(investmentVariation(position)).toBeCloseTo(variation!);
  });
  it('does not introduce binary subtraction residue into a zero result', () => {
    expect(investmentResult({ currentValue: 0.1, redeemedValue: 0.2, totalInvested: 0.3 })).toBe(0);
  });
});
