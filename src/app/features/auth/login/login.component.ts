import { AuthAccessibilityDirective } from '../../../core/auth/auth-accessibility.directive';
import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { authRetryAfterSeconds, classifyAuthError } from '../../../core/auth/auth-errors';
import { SessionOperationError } from '../../../core/auth/session-coordinator';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthAccessibilityDirective],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly sessionMessage = this.authService.sessionMessage;
  readonly recoveryRequired = this.authService.recoveryRequired;
  readonly showRecoveryHelp = signal(false);
  readonly canResendVerification = signal(false);
  readonly retrySeconds = signal(0);
  private retryDeadline = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Exibe mensagem de sucesso após cadastro ou verificação */
  readonly justRegistered = this.route.snapshot.queryParamMap.has('registered');
  readonly verified = this.route.snapshot.queryParamMap.has('verified');

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, (control: AbstractControl) =>
      typeof control.value === 'string' && control.value.trim() ? null : { required: true }]],
  });

  get emailControl() {
    return this.form.get('email')!;
  }

  get passwordControl() {
    return this.form.get('password')!;
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.isLoading() || this.retrySeconds() > 0 || this.recoveryRequired()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.canResendVerification.set(false);

    const { email, password } = this.form.value;

    this.authService.login({ email: email!, password: password! }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.form.controls.password.reset(''); void this.router.navigate(['/dashboard']); },
      error: err => {
        this.isLoading.set(false);
        const presentation = classifyAuthError('login', err);
        this.errorMessage.set(err instanceof SessionOperationError ? err.message : presentation.message);
        this.canResendVerification.set(presentation.kind === 'email-not-verified');
        const seconds = authRetryAfterSeconds(err);
        if (seconds !== null && seconds > 0) this.startRetryWait(seconds);
      },
      complete: () => this.isLoading.set(false),
    });
  }

  private startRetryWait(seconds: number): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryDeadline = Date.now() + seconds * 1000;
    const update = () => {
      this.retrySeconds.set(Math.max(0, Math.ceil((this.retryDeadline - Date.now()) / 1000)));
      this.retryTimer = this.retrySeconds() > 0 ? setTimeout(update, 1000) : null;
    };
    update();
  }

  ngOnDestroy(): void {
    this.authService.cancelPendingLogin();
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.form.controls.password.reset('');
  }
}
