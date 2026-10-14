import { AbstractControl, ValidationErrors } from '@angular/forms';

export const MAX_PURCHASE_CENTS = 999999999999999;

/** Parse the entered decimal before converting to Number; never round user input. */
export function purchaseCents(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_PURCHASE_CENTS ? cents : null;
}

export function centsDecimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function purchaseMoneyValidator(control: AbstractControl): ValidationErrors | null {
  return purchaseCents(control.value) === null ? { money: true } : null;
}

export function installmentCountValidator(control: AbstractControl): ValidationErrors | null {
  const count = control.value;
  return Number.isInteger(count) && count >= 1 && count <= 120 ? null : { count: true };
}

export function purchaseDateValidator(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? '');
  const date = new Date(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && text.slice(0, 4) !== '0000' &&
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? null : { date: true };
}

export function automaticPurchaseAmounts(total: number, count: number): number[] {
  if (!Number.isSafeInteger(total) || total < count || total > MAX_PURCHASE_CENTS ||
      !Number.isInteger(count) || count < 1 || count > 120) return [];
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index === count - 1 ? total % count : 0));
}

export function purchasePlanError(total: unknown, count: number, mode: string,
  rows: readonly { amount: unknown }[]): string | null {
  const cents = purchaseCents(total);
  if (cents === null || !Number.isInteger(count) || count < 1 || count > 120) return null;
  if (mode === 'AUTOMATIC') return cents < count ? 'A quantidade informada geraria uma parcela de valor zero.' : null;
  if (rows.length !== count) return 'Informe todas as parcelas do plano.';
  const amounts = rows.map(row => purchaseCents(row.amount));
  if (amounts.some(amount => amount === null)) return 'Cada parcela deve ter valor positivo, com até duas casas decimais.';
  // The sum is allowed to exceed the safe Number range for an invalid plan.
  const sum = amounts.reduce<bigint>((result, amount) => result + BigInt(amount!), BigInt(0));
  return sum === BigInt(cents) ? null : 'A soma das parcelas deve ser exatamente igual ao valor total da compra.';
}

export function purchaseFieldError(field: string, message: string): string {
  if (message.includes('must not be null') || message.includes('must not be blank')) return 'Obrigatório.';
  if (field === 'description') return 'Informe uma descrição com até 255 caracteres.';
  if (field === 'installmentsCount') return 'Informe um número inteiro entre 1 e 120.';
  if (field === 'purchaseDate') return 'Informe uma data válida.';
  if (field.endsWith('categoryId')) return 'Selecione uma categoria disponível de despesa ou neutra.';
  if (field === 'totalValue' || field.endsWith('.amount')) return 'Informe um valor positivo, até 9.999.999.999.999,99, com no máximo duas casas decimais.';
  return 'Revise este campo.';
}
