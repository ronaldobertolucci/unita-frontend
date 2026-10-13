import { AuthAccessibilityDirective } from '../../../core/auth/auth-accessibility.directive';
import {
  Component,
  DestroyRef,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { applyAuthFields, AuthRetryWait, latestBirthDate, matchingPasswords, nonBlankControl, pastCalendarDate } from '../../../core/auth/auth-form';
import { classifyAuthError } from '../../../core/auth/auth-errors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthAccessibilityDirective],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  readonly retry = new AuthRetryWait(this.destroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  /** Último dia passado no calendário local para o campo de nascimento */
  readonly maxDate = latestBirthDate();

  readonly form = this.fb.group(
    {
      firstName: ['', [nonBlankControl, Validators.minLength(2), Validators.maxLength(100)]],
      lastName: ['', [nonBlankControl, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', [nonBlankControl, Validators.email, Validators.maxLength(255)]],
      dateOfBirth: ['', [Validators.required, pastCalendarDate]],
      password: ['', [nonBlankControl, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchingPasswords('password') }
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
    if (this.isLoading() || this.retry.seconds() > 0) return;
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.reset();
          void this.router.navigate(['/login'], { queryParams: { registered: true } });
        },
        error: err => {
          this.isLoading.set(false);
          applyAuthFields(this.form, err, {
            firstName: 'Informe um nome não branco entre 2 e 100 caracteres.',
            lastName: 'Informe um sobrenome não branco entre 2 e 100 caracteres.',
            email: 'Confira o e-mail informado (até 255 caracteres).',
            dateOfBirth: 'Informe uma data de nascimento real e anterior ao dia atual do servidor.',
            password: 'Informe uma senha não branca com pelo menos 8 caracteres.'
          });
          this.errorMessage.set(classifyAuthError('register', err).message);
          this.retry.start(err);
        },
        complete: () => this.isLoading.set(false),
      });
  }
  ngOnDestroy(): void { this.form.reset(); }
}
