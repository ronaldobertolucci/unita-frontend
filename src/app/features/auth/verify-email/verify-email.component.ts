import { AuthAccessibilityDirective } from '../../../core/auth/auth-accessibility.directive';
import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, switchMap, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { LinkTokenService } from '../../../core/auth/link-token.service';
import { applyAuthFields, AuthRetryWait, nonBlankControl } from '../../../core/auth/auth-form';
import { classifyAuthError } from '../../../core/auth/auth-errors';

type PageState = 'verifying' | 'resend' | 'resend-sent';
@Component({ selector: 'app-verify-email', standalone: true, imports: [ReactiveFormsModule, RouterLink, AuthAccessibilityDirective],
  templateUrl: './verify-email.component.html', styleUrl: './verify-email.component.css' })
export class VerifyEmailComponent implements OnInit, OnDestroy {
  private readonly linkChanges = new Subject<void>();
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly links = inject(LinkTokenService);
  private readonly destroyRef = inject(DestroyRef);
  readonly retry = new AuthRetryWait(this.destroyRef);
  readonly pageState = signal<PageState>('verifying');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly resendForm = this.fb.group({ email: ['', [nonBlankControl, Validators.email]] });
  get emailControl() { return this.resendForm.controls.email; }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(switchMap(params => {
      this.linkChanges.next(); this.retry.clear(); this.isSubmitting.set(false); this.resendForm.reset();
      const link = this.links.take('/verify-email', params);
      this.errorMessage.set(null); this.pageState.set('verifying');
      if (!link.token) {
        this.pageState.set('resend');
        if (link.provided || !link.cleaned) this.errorMessage.set('O link não pôde ser utilizado. Reabra o link recebido ou solicite outro.');
        return EMPTY;
      }
      return this.auth.verifyEmail(link.token).pipe(switchMap(() => {
        void this.router.navigate(['/login'], { queryParams: { verified: true } }); return EMPTY;
      }), catchError(error => {
        this.errorMessage.set(classifyAuthError('verify-email', error).message); this.pageState.set('resend'); return EMPTY;
      }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  submitResend(): void {
    if (this.isSubmitting() || this.pageState() !== 'resend' || this.retry.seconds() > 0) return;
    if (this.resendForm.invalid) { this.resendForm.markAllAsTouched(); return; }
    this.isSubmitting.set(true); this.errorMessage.set(null);
    this.auth.resendVerification(this.emailControl.value!).pipe(takeUntil(this.linkChanges), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.resendForm.reset(); this.pageState.set('resend-sent'); },
      error: error => {
        applyAuthFields(this.resendForm, error, { email: 'Confira o e-mail informado.' });
        this.errorMessage.set(classifyAuthError('resend-verification', error).message);
        this.retry.start(error); this.isSubmitting.set(false);
      }, complete: () => this.isSubmitting.set(false)
    });
  }
  ngOnDestroy(): void { this.linkChanges.next(); this.linkChanges.complete(); this.resendForm.reset(); }
}
