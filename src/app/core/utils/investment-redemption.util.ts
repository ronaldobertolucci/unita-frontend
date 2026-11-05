// Align decimal scales before subtracting; avoid binary floating-point subtraction.
export function redemptionNet(gross: number, tax: number): number {
  const decimal = (value: number): [bigint, number] => {
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const scale = (mantissa.split('.')[1]?.length ?? 0) - Number(exponent);
    return [BigInt(mantissa.replace('.', '')), scale];
  };
  const [g, gs] = decimal(gross);
  const [t, ts] = decimal(tax);
  const scale = Math.max(gs, ts, 0);
  const difference = g * 10n ** BigInt(scale - gs) - t * 10n ** BigInt(scale - ts);
  const digits = difference.toString().padStart(scale + 1, '0');
  return Number(scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
}


// Fixed-scale arithmetic for the API's DECIMAL(18,8) quantities.
export function investmentUnits(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).trim().replace(',', '.').match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const exponent = Number(match[3] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 30) return null;
  const decimals = match[2] ?? '';
  const digits = BigInt(match[1] + decimals);
  const shift = 8 + exponent - decimals.length;
  if (shift < -30) return null;
  if (shift < 0 && digits % (10n ** BigInt(-shift)) !== 0n) return null;
  const units = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift);
  return units <= 999999999999999999n ? units : null;
}

export function investmentQuantityText(units: bigint): string {
  const whole = units / 100000000n;
  const fraction = (units % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function proportionalSaleValue(value: number, sold: bigint, available: bigint): number | null {
  const scaledValue = investmentUnits(value);
  if (scaledValue === null || available <= 0n || sold <= 0n || sold > available) return null;
  const product = scaledValue * sold;
  const rounded = product / available + (product % available * 2n >= available ? 1n : 0n);
  return Number(investmentQuantityText(rounded));
}
