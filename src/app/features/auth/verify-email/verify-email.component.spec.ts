import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { VerifyEmailComponent } from './verify-email.component';
import { AuthService } from '../../../core/services/auth.service';

function buildActivatedRoute(token: string | null) {
  return {
    snapshot: {
      queryParamMap: {
        get: (key: string) => (key === 'token' ? token : null),
      },
    },
  };
}

function buildAuthService() {
  return {
    verifyEmail:          jest.fn(),
    resendVerification:   jest.fn(),
  };
}

describe('VerifyEmailComponent', () => {
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let component: VerifyEmailComponent;
  let authServiceSpy: ReturnType<typeof buildAuthService>;
  let router: Router;

  function setup(token: string | null = null) {
    authServiceSpy = buildAuthService();

    TestBed.configureTestingModule({
      imports: [VerifyEmailComponent, RouterTestingModule],
      providers: [
        { provide: AuthService,    useValue: authServiceSpy },
        { provide: ActivatedRoute, useValue: buildActivatedRoute(token) },
      ],
    });

    fixture   = TestBed.createComponent(VerifyEmailComponent);
    component = fixture.componentInstance;
    router    = TestBed.inject(Router);
    fixture.detectChanges();
  }

  // ─── Sem token na URL ─────────────────────────────────────────────────────

  describe('without token in URL', () => {
    beforeEach(() => setup(null));

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should go directly to resend state', () => {
      expect(component.pageState()).toBe('resend');
    });

    it('should NOT call verifyEmail', () => {
      expect(authServiceSpy.verifyEmail).not.toHaveBeenCalled();
    });

    it('should start with no errorMessage', () => {
      expect(component.errorMessage()).toBeNull();
    });

    it('should start with alreadyVerified false', () => {
      expect(component.alreadyVerified()).toBe(false);
    });

    it('should start with an invalid resendForm', () => {
      expect(component.resendForm.invalid).toBe(true);
    });
  });

  // ─── Com token válido na URL ──────────────────────────────────────────────

  describe('with valid token in URL', () => {
    beforeEach(() => {
      authServiceSpy = buildAuthService();
      authServiceSpy.verifyEmail.mockReturnValue(of(undefined));
      TestBed.configureTestingModule({
        imports: [VerifyEmailComponent, RouterTestingModule],
        providers: [
          { provide: AuthService,    useValue: authServiceSpy },
          { provide: ActivatedRoute, useValue: buildActivatedRoute('valid-token') },
        ],
      });
      fixture   = TestBed.createComponent(VerifyEmailComponent);
      component = fixture.componentInstance;
      router    = TestBed.inject(Router);
    });

    it('should call verifyEmail with the token from the URL', () => {
      fixture.detectChanges();
      expect(authServiceSpy.verifyEmail).toHaveBeenCalledWith('valid-token');
    });

    it('should start in verifying state before the response', () => {
      // Before detectChanges the observable hasn't resolved in the test
      expect(component.pageState()).toBe('verifying');
    });

    it('should navigate to /login?verified=true on success', () => {
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
      expect(navigateSpy).toHaveBeenCalledWith(['/login'], { queryParams: { verified: true } });
    });
  });

  // ─── Com token inválido na URL ────────────────────────────────────────────

  describe('with invalid token in URL', () => {
    beforeEach(() => {
      authServiceSpy = buildAuthService();
      authServiceSpy.verifyEmail.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: 'Token inválido' } }))
      );
      TestBed.configureTestingModule({
        imports: [VerifyEmailComponent, RouterTestingModule],
        providers: [
          { provide: AuthService,    useValue: authServiceSpy },
          { provide: ActivatedRoute, useValue: buildActivatedRoute('invalid-token') },
        ],
      });
      fixture   = TestBed.createComponent(VerifyEmailComponent);
      component = fixture.componentInstance;
      router    = TestBed.inject(Router);
      fixture.detectChanges();
    });

    it('should transition to resend state on error', () => {
      expect(component.pageState()).toBe('resend');
    });

    it('should set errorMessage explaining the invalid token', () => {
      expect(component.errorMessage()).toBeTruthy();
    });

    it('should NOT navigate', () => {
      const navigateSpy = jest.spyOn(router, 'navigate');
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  // ─── submitResend() — validação de formulário ─────────────────────────────

  describe('submitResend() — form validation', () => {
    beforeEach(() => setup(null));

    it('should mark form as touched and not call API when form is empty', () => {
      component.submitResend();
      expect(authServiceSpy.resendVerification).not.toHaveBeenCalled();
      expect(component.emailControl.touched).toBe(true);
    });

    it('should mark email as invalid when format is wrong', () => {
      component.resendForm.setValue({ email: 'not-an-email' });
      component.resendForm.markAllAsTouched();
      expect(component.emailControl.hasError('email')).toBe(true);
    });

    it('should mark email as invalid when empty', () => {
      component.resendForm.setValue({ email: '' });
      component.resendForm.markAllAsTouched();
      expect(component.emailControl.hasError('required')).toBe(true);
    });
  });

  // ─── submitResend() — sucesso ─────────────────────────────────────────────

  describe('submitResend() — success', () => {
    beforeEach(() => setup(null));

    it('should call resendVerification with the entered email', () => {
      authServiceSpy.resendVerification.mockReturnValue(of(undefined));
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(authServiceSpy.resendVerification).toHaveBeenCalledWith('joao@email.com');
    });

    it('should transition to resend-sent state on success', () => {
      authServiceSpy.resendVerification.mockReturnValue(of(undefined));
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.pageState()).toBe('resend-sent');
    });

    it('should set isSubmitting to false after success', () => {
      authServiceSpy.resendVerification.mockReturnValue(of(undefined));
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should clear errorMessage before submitting', () => {
      authServiceSpy.resendVerification.mockReturnValue(of(undefined));
      component['errorMessage'].set('erro anterior');
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── submitResend() — erro 409 (já verificado) ────────────────────────────

  describe('submitResend() — 409 already verified', () => {
    beforeEach(() => setup(null));

    it('should set alreadyVerified to true on 409', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 409 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.alreadyVerified()).toBe(true);
    });

    it('should NOT set errorMessage on 409', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 409 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.errorMessage()).toBeNull();
    });

    it('should stay in resend state on 409', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 409 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.pageState()).toBe('resend');
    });

    it('should set isSubmitting to false on 409', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 409 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should reset alreadyVerified to false on next submission attempt', () => {
      authServiceSpy.resendVerification.mockReturnValueOnce(
        throwError(() => ({ status: 409 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.alreadyVerified()).toBe(true);

      authServiceSpy.resendVerification.mockReturnValue(of(undefined));
      component.submitResend();
      expect(component.alreadyVerified()).toBe(false);
    });
  });

  // ─── submitResend() — erro genérico ───────────────────────────────────────

  describe('submitResend() — generic error', () => {
    beforeEach(() => setup(null));

    it('should set errorMessage on non-409 error', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 500 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.errorMessage()).toBeTruthy();
    });

    it('should NOT set alreadyVerified on non-409 error', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 500 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.alreadyVerified()).toBe(false);
    });

    it('should set isSubmitting to false on error', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 500 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should stay in resend state on error', () => {
      authServiceSpy.resendVerification.mockReturnValue(
        throwError(() => ({ status: 500 }))
      );
      component.resendForm.setValue({ email: 'joao@email.com' });
      component.submitResend();
      expect(component.pageState()).toBe('resend');
    });
  });
});