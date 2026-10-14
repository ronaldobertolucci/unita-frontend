import { FormControl } from '@angular/forms';
import { automaticPurchaseAmounts, centsDecimal, MAX_PURCHASE_CENTS, purchaseCents,
  purchaseDateValidator, purchasePlanError } from './purchase-plan.util';

describe('Purchase plan exact decimal validation', () => {
  it.each(['9999999999999.99', '9999999999999,99', 9999999999999.99])('preserves the contract maximum %s', value => {
    expect(purchaseCents(value)).toBe(MAX_PURCHASE_CENTS);
    expect(centsDecimal(MAX_PURCHASE_CENTS)).toBe('9999999999999.99');
  });

  it.each(['1.001', '9999999999999.990', '10000000000000', '1e2', 'NaN', '', '0', '-0.01'])('rejects %s without rounding', value => {
    expect(purchaseCents(value)).toBeNull();
  });

  it('puts the remainder in the final installment, including at the money and count limits', () => {
    expect(automaticPurchaseAmounts(10000, 3)).toEqual([3333, 3333, 3334]);
    const amounts = automaticPurchaseAmounts(MAX_PURCHASE_CENTS, 120);
    expect(amounts).toHaveLength(120);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(MAX_PURCHASE_CENTS);
    expect(automaticPurchaseAmounts(1, 1)).toEqual([1]);
    expect(automaticPurchaseAmounts(2, 3)).toEqual([]);
  });

  it('checks custom sums exactly without decimal tolerance or integer overflow', () => {
    expect(purchasePlanError('0.30', 2, 'CUSTOM', [{ amount: '0.10' }, { amount: '0.20' }])).toBeNull();
    expect(purchasePlanError('100', 3, 'CUSTOM', [{ amount: '33.33' }, { amount: '33.33' }, { amount: '33.33' }])).toContain('soma');
    const rows = Array.from({ length: 120 }, () => ({ amount: '9999999999999.99' }));
    expect(purchasePlanError('9999999999999.99', 120, 'CUSTOM', rows)).toContain('soma');
  });

  it.each(['2027-01-31', '2027-02-28', '2028-02-29', '2027-03-31'])('accepts the real calendar date %s', value => {
    expect(purchaseDateValidator(new FormControl(value))).toBeNull();
  });

  it.each(['2027-02-29', '2027-04-31', '0000-01-01', '2027-13-01'])('rejects the invalid calendar date %s', value => {
    expect(purchaseDateValidator(new FormControl(value))).toEqual({ date: true });
  });
});
