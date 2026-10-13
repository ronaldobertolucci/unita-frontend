import { DestroyRef, signal } from '@angular/core';
import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';
import { authFieldErrors, authRetryAfterSeconds } from './auth-errors';
import { calendarDate } from './auth-contract';

export function nonBlankControl(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true };
}

export function localCalendarDate(date = new Date()): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function latestBirthDate(): string {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  return localCalendarDate(yesterday);
}

export function pastCalendarDate(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return calendarDate(control.value) && control.value < localCalendarDate() ? null : { pastDate: true };
}

export function matchingPasswords(passwordField: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordField)?.value, confirmation = group.get('confirmPassword')?.value;
    return password && confirmation && password !== confirmation ? { passwordMismatch: true } : null;
  };
}

/** Attach only client-owned messages; Angular clears these errors when edited. */
export function applyAuthFields(form: FormGroup, error: unknown, messages: Readonly<Record<string, string>>): number {
  const fields = authFieldErrors(error, messages);
  for (const [field, message] of Object.entries(fields)) {
    const control = form.get(field);
    if (control) { control.setErrors({ ...control.errors, api: message }); control.markAsTouched(); }
  }
  return Object.keys(fields).length;
}

export class AuthRetryWait {
  readonly seconds = signal(0);
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(owner: DestroyRef) { owner.onDestroy(() => this.clear()); }
  start(error: unknown): void {
    this.clear();
    const seconds = authRetryAfterSeconds(error);
    if (seconds === null || seconds <= 0) return;
    const deadline = Date.now() + seconds * 1000;
    const tick = () => {
      this.seconds.set(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      this.timer = this.seconds() > 0 ? setTimeout(tick, 1000) : null;
    };
    tick();
  }
  clear(): void { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; this.seconds.set(0); }
}
