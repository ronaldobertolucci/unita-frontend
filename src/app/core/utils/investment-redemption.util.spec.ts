import { redemptionNet } from './investment-redemption.util';

describe('legacy redemption decimal baseline', () => {
  it.each([
    [1100, 15, 1085], [1100, 0, 1100], [1100, 1100, 0],
    [0.30, 0.20, 0.10], [15.12345678, 0.12345678, 15],
  ])('previews gross %s minus tax %s as %s', (gross, tax, net) => {
    expect(redemptionNet(gross, tax)).toBe(net);
  });
});
