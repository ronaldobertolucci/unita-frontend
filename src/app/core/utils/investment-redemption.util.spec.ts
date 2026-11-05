import { redemptionNet, investmentUnits, investmentQuantityText, proportionalSaleValue } from './investment-redemption.util';

describe('legacy redemption decimal baseline', () => {
  it.each([
    [1100, 15, 1085], [1100, 0, 1100], [1100, 1100, 0],
    [0.30, 0.20, 0.10], [15.12345678, 0.12345678, 15],
  ])('previews gross %s minus tax %s as %s', (gross, tax, net) => {
    expect(redemptionNet(gross, tax)).toBe(net);
  });
});


describe('partial sale decimal quantities', () => {
  it('subtracts fractional quantities and preserves the smallest unit', () => {
    expect(investmentQuantityText(investmentUnits(0.3)! - investmentUnits('0.2')!)).toBe('0.1');
    expect(investmentQuantityText(investmentUnits(1e-8)!)).toBe('0.00000001');
    expect(investmentUnits('1.000000000')).toBe(100000000n);
  });
  it.each(['1.000000001', '10000000000', '-1', '', null, Infinity])('rejects invalid precision/range %s', value => {
    expect(investmentUnits(value)).toBeNull();
  });
  it('rounds proportional estimates HALF_UP at eight decimals', () => {
    expect(proportionalSaleValue(3300, 100000000n, 300000000n)).toBe(1100);
    expect(proportionalSaleValue(1, 100000000n, 300000000n)).toBe(0.33333333);
    expect(proportionalSaleValue(0.00000001, 100000000n, 200000000n)).toBe(0.00000001);
    expect(proportionalSaleValue(3300, 300000000n, 300000000n)).toBe(3300);
  });
});
