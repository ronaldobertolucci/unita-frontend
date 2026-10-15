// Format only, matching the legacy institution API; no check-digit validation.
// Require the absolute end: JavaScript's $ alone also accepts a trailing newline.
export const CNPJ_INPUT_PATTERN = /^(?:[A-Za-z0-9]{12}[0-9]{2}|[A-Za-z0-9]{2}\.[A-Za-z0-9]{3}\.[A-Za-z0-9]{3}\/[A-Za-z0-9]{4}-[0-9]{2})$(?![\s\S])/;

export function normalizeCnpj(value: string): string {
  // Invalid historical text must stay readable and require explicit correction.
  return CNPJ_INPUT_PATTERN.test(value) ? value.replace(/[./-]/g, '').toUpperCase() : value;
}

export function formatCnpj(value: string): string {
  if (!CNPJ_INPUT_PATTERN.test(value)) return value;
  return normalizeCnpj(value).replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}
