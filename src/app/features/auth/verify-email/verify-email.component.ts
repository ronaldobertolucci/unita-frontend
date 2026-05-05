import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

type PageState = 'verifying' | 'resend' | 'resend-sent';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.css',
})
export class VerifyEmailComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly fb          = inject(FormBuilder);

  readonly pageState    = signal<PageState>('verifying');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  // true quando o 409 indica que o e-mail já foi verificado
  readonly alreadyVerified = signal(false);

  readonly resendForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get emailControl() { return this.resendForm.get('email')!; }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.pageState.set('resend');
      return;
    }

    this.authService.verifyEmail(token).subscribe({
      next: () => {
        this.router.navigate(['/login'], { queryParams: { verified: true } });
      },
      error: () => {
        this.pageState.set('resend');
        this.errorMessage.set('O link de verificação é inválido ou expirou. Solicite um novo abaixo.');
      },
    });
  }

  submitResend(): void {
    if (this.resendForm.invalid) {
      this.resendForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.alreadyVerified.set(false);

    const email = this.emailControl.value!;

    this.authService.resendVerification(email).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.pageState.set('resend-sent');
      },
      error: err => {
        this.isSubmitting.set(false);
        if (err?.status === 409) {
          this.alreadyVerified.set(true);
        } else {
          this.errorMessage.set('Ocorreu um erro. Tente novamente.');
        }
      },
    });
  }
}