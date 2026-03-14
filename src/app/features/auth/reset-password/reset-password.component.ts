import { Component, inject, signal, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (password && confirm && password !== confirm) {
    return { passwordMismatch: true };
  }
  return null;
}

type PageState = 'validating' | 'invalid-token' | 'form' | 'success';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly pageState = signal<PageState>('validating');
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  private token = '';

  readonly form = this.fb.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator }
  );

  get newPasswordControl() { return this.form.get('newPassword')!; }
  get confirmPasswordControl() { return this.form.get('confirmPassword')!; }

  get hasPasswordMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      this.confirmPasswordControl.touched
    );
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.token) {
      this.pageState.set('invalid-token');
      return;
    }

    this.http
      .get(`${environment.apiUrl}/password/reset/validate`, {
        params: { token: this.token },
      })
      .subscribe({
        next: () => this.pageState.set('form'),
        error: () => this.pageState.set('invalid-token'),
      });
  }

  togglePassword(): void { this.showPassword.update(v => !v); }
  toggleConfirmPassword(): void { this.showConfirmPassword.update(v => !v); }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { newPassword } = this.form.value;

    this.http
      .post(`${environment.apiUrl}/password/reset`, {
        token: this.token,
        newPassword: newPassword!,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.pageState.set('success');
        },
        error: err => {
          this.isLoading.set(false);
          this.errorMessage.set(
            err.error?.message ?? 'Ocorreu um erro. Tente novamente.'
          );
        },
      });
  }
}