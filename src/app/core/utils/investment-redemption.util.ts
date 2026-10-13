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
