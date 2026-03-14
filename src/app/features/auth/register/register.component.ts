import {
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (password && confirm && password !== confirm) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  /** Limite para o campo de data de nascimento (hoje) */
  readonly maxDate = new Date().toISOString().split('T')[0];

  readonly form = this.fb.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email]],
      dateOfBirth: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator }
  );

  get firstNameControl() { return this.form.get('firstName')!; }
  get lastNameControl() { return this.form.get('lastName')!; }
  get emailControl() { return this.form.get('email')!; }
  get dateOfBirthControl() { return this.form.get('dateOfBirth')!; }
  get passwordControl() { return this.form.get('password')!; }
  get confirmPasswordControl() { return this.form.get('confirmPassword')!; }

  get hasPasswordMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      this.confirmPasswordControl.touched
    );
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { firstName, lastName, email, dateOfBirth, password } = this.form.value;

    this.authService
      .register({
        firstName: firstName!,
        lastName: lastName!,
        email: email!,
        dateOfBirth: dateOfBirth!,
        password: password!,
      })
      .subscribe({
        next: () =>
          this.router.navigate(['/login'], {
            queryParams: { registered: true },
          }),
        error: err => {
          this.isLoading.set(false);
          const details: string[] = err.error?.details;
          if (details?.length) {
            this.errorMessage.set(details.join(' • '));
          } else {
            this.errorMessage.set(
              err.error?.message ?? 'Ocorreu um erro. Tente novamente.'
            );
          }
        },
      });
  }
}