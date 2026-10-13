import { FormControl } from '@angular/forms';
import { amountValidator, localDateValidator, reminderValidator, validMonth } from './recurring-bill.validators';
import { classifyAuthRequest } from '../../core/auth/auth-request-policy';

describe('Recurring contract validation', () => {
  it.each(['', '0.01', '129,90', '9999999999999.99'])('accepts unknown or valid amount %s', value => {
    expect(amountValidator(new FormControl(value))).toBeNull();
  });
  it.each(['0', '-1', '1.001', '10000000000000', '1e3', 'abc'])('rejects amount %s without rounding', value => {
    expect(amountValidator(new FormControl(value))).not.toBeNull();
  });
  it.each(['1900-01-01', '9998-12-31', '2024-02-29', '2026-01-31'])('accepts anchor %s', value => {
    expect(localDateValidator(new FormControl(value))).toBeNull();
  });
  it.each(['1899-12-31', '9999-01-01', '2027-02-29', '2026-04-31', '2026-13-01', ''])('rejects invalid anchor %s', value => {
    expect(localDateValidator(new FormControl(value))).not.toBeNull();
  });
  it.each([0, 3, 30])('accepts reminder %s', value => expect(reminderValidator(new FormControl(value))).toBeNull());
  it.each([-1, 31, 1.5, null, ''])('rejects reminder %s', value => expect(reminderValidator(new FormControl(value))).not.toBeNull());
  it('validates projection year and exact month format', () => {
    expect(validMonth('1900-01')).toBe(true); expect(validMonth('9998-12')).toBe(true);
    expect(validMonth('2027-2')).toBe(false); expect(validMonth('2027-13')).toBe(false); expect(validMonth('9999-01')).toBe(false);
  });
  it.each([['GET', ''], ['POST', ''], ['GET', '/upcoming'], ['GET', '/7'], ['PATCH', '/7']])('authorizes contract route %s %s', (method, suffix) => {
    expect(classifyAuthRequest(`/api/recurring-bills${suffix}`, method, '/api', 'http://localhost/')).toBe('protected');
  });
  it('does not authorize delete, payment, queue or foreign-origin requests', () => {
    for (const [method, path] of [['DELETE', '/7'], ['POST', '/7/pay'], ['GET', '/queue']]) {
      expect(classifyAuthRequest(`/api/recurring-bills${path}`, method, '/api', 'http://localhost/')).toBe('other');
    }
    expect(classifyAuthRequest('https://foreign.invalid/api/recurring-bills', 'POST', '/api', 'http://localhost/')).toBe('other');
  });
});
