import { AuthAccessibilityDirective } from '../../../core/auth/auth-accessibility.directive';
import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { applyAuthFields, AuthRetryWait, nonBlankControl } from '../../../core/auth/auth-form';
import { classifyAuthError } from '../../../core/auth/auth-errors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({ selector: 'app-forgot-password', standalone: true, imports: [ReactiveFormsModule, RouterLink, AuthAccessibilityDirective],
  templateUrl: './forgot-password.component.html', styleUrl: './forgot-password.component.css' })
export class ForgotPasswordComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly retry = new AuthRetryWait(this.destroyRef);
  readonly isLoading = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = this.fb.group({ email: ['', [nonBlankControl, Validators.email]] });
  get emailControl() { return this.form.controls.email; }

  onSubmit(): void {
    if (this.isLoading() || this.submitted() || this.retry.seconds() > 0) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isLoading.set(true); this.errorMessage.set(null);
    this.auth.forgotPassword(this.emailControl.value!).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.form.reset(); this.submitted.set(true); },
      error: error => {
        applyAuthFields(this.form, error, { email: 'Confira o e-mail informado.' });
        this.errorMessage.set(classifyAuthError('forgot-password', error).message);
        this.retry.start(error); this.isLoading.set(false);
      },
      complete: () => this.isLoading.set(false)
    });
  }
  ngOnDestroy(): void { this.form.reset(); }
}
