import { AuthAccessibilityDirective } from '../../../core/auth/auth-accessibility.directive';
import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { LinkTokenService } from '../../../core/auth/link-token.service';
import { applyAuthFields, AuthRetryWait, matchingPasswords, nonBlankControl } from '../../../core/auth/auth-form';
import { classifyAuthError, readAuthApiError } from '../../../core/auth/auth-errors';

type PageState = 'validating' | 'validation-error' | 'invalid-token' | 'form' | 'success' | 'uncertain';
@Component({ selector: 'app-reset-password', standalone: true, imports: [ReactiveFormsModule, RouterLink, AuthAccessibilityDirective],
  templateUrl: './reset-password.component.html', styleUrl: './reset-password.component.css' })
export class ResetPasswordComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly links = inject(LinkTokenService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly linkChanges = new Subject<void>();
  private version = 0;
  private token: string | null = null;
  readonly retry = new AuthRetryWait(this.destroyRef);
  readonly pageState = signal<PageState>('validating');
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly form = this.fb.group({
    newPassword: ['', [nonBlankControl, Validators.minLength(8)]], confirmPassword: ['', [Validators.required]]
  }, { validators: matchingPasswords('newPassword') });
  get newPasswordControl() { return this.form.controls.newPassword; }
  get confirmPasswordControl() { return this.form.controls.confirmPassword; }
  get hasPasswordMismatch(): boolean { return this.form.hasError('passwordMismatch') && this.confirmPasswordControl.touched; }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.linkChanges.next(); this.version++; this.clearSecrets(); this.retry.clear(); this.isLoading.set(false);
      const link = this.links.take('/reset-password', params); this.errorMessage.set(null);
      if (!link.token) {
        this.pageState.set('invalid-token');
        this.errorMessage.set('Reabra o link recebido por e-mail. Após recarregar esta página, o token não está mais disponível. Se necessário, solicite outro link.');
        return;
      }
      this.token = link.token; this.validateToken();
    });
  }
  revalidate(): void {
    if (this.pageState() === 'validation-error' && !this.isLoading() && this.retry.seconds() === 0) this.validateToken();
  }
  private validateToken(): void {
    if (!this.token) return;
    const version = this.version;
    this.pageState.set('validating'); this.isLoading.set(true); this.errorMessage.set(null);
    this.auth.validateResetToken(this.token).pipe(takeUntil(this.linkChanges), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { if (version === this.version) this.pageState.set('form'); },
      error: error => {
        if (version !== this.version) return;
        const presentation = classifyAuthError('reset-validate', error);
        this.errorMessage.set(presentation.message); this.isLoading.set(false); this.retry.start(error);
        if (presentation.kind === 'invalid-link') { this.clearSecrets(); this.pageState.set('invalid-token'); }
        else this.pageState.set('validation-error');
      }, complete: () => { if (version === this.version) this.isLoading.set(false); }
    });
  }
  togglePassword(): void { this.showPassword.update(value => !value); }
  toggleConfirmPassword(): void { this.showConfirmPassword.update(value => !value); }

  onSubmit(): void {
    if (this.pageState() !== 'form' || !this.token || this.isLoading() || this.retry.seconds() > 0) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const version = this.version;
    this.isLoading.set(true); this.errorMessage.set(null);
    this.auth.resetPassword({ token: this.token, newPassword: this.newPasswordControl.value! })
      .pipe(takeUntil(this.linkChanges), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { if (version === this.version) { this.clearSecrets(); this.pageState.set('success'); } },
        error: error => {
          if (version !== this.version) return;
          const presentation = classifyAuthError('reset-password', error), evidence = readAuthApiError(error);
          this.isLoading.set(false); this.retry.start(error);
          if (presentation.kind === 'invalid-link') {
            this.clearSecrets(); this.pageState.set('invalid-token'); this.errorMessage.set(presentation.message);
          } else if (evidence.status === 400 && evidence.error === 'Validation Failed' && evidence.fields.has('newPassword')) {
            applyAuthFields(this.form, error, { newPassword: 'Informe uma senha não branca com pelo menos 8 caracteres.' });
            this.errorMessage.set('Confira a nova senha informada.');
          } else {
            this.clearSecrets(); this.pageState.set('uncertain');
            this.errorMessage.set('Não foi possível confirmar o resultado. A senha pode ter sido alterada. Tente fazer login ou solicite outro link; esta redefinição não será repetida.');
          }
        }, complete: () => { if (version === this.version) this.isLoading.set(false); }
      });
  }
  private clearSecrets(): void { this.token = null; this.form.reset(); this.showPassword.set(false); this.showConfirmPassword.set(false); }
  ngOnDestroy(): void { this.linkChanges.next(); this.linkChanges.complete(); this.version++; this.clearSecrets(); }
}
