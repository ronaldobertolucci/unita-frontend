import { AbstractControl, ValidationErrors } from '@angular/forms';

export function amountValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  return /^\d{1,13}([.,]\d{1,2})?$/.test(value) && Number(value.replace(',', '.')) > 0
    ? null : { amount: true };
}
export function localDateValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { localDate: true };
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1900 && year <= 9998 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    ? null : { localDate: true };
}
export function reminderValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return value !== null && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 30
    ? null : { reminder: true };
}
export function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 9998;
}
