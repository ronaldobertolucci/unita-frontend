import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { LoginResponse } from '../../../core/models/auth.model';
import { signal } from '@angular/core';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

const mockLoginResponse: LoginResponse = {
  token: 'fake-token',
  type: 'Bearer',
  expiresIn: 7200,
  user: {
    id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@email.com', dateOfBirth: '1990-01-01',
    enabled: true, emailVerified: true, roles: ['USER']
  },
};

function buildActivatedRoute(withRegistered: boolean) {
  return {
    snapshot: {
      queryParamMap: {
        has: (key: string) => withRegistered && key === 'registered',
      },
    },
  };
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let authServiceSpy: jest.Mocked<Pick<AuthService, 'login' | 'cancelPendingLogin'>> & Pick<AuthService, 'sessionMessage' | 'recoveryRequired'>;
  let router: Router;

  function setup(registeredParam = false) {
    authServiceSpy = { login: jest.fn(), cancelPendingLogin: jest.fn(), sessionMessage: signal<string | null>(null), recoveryRequired: signal(false) };

    TestBed.configureTestingModule({
      imports: [LoginComponent, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ActivatedRoute, useValue: buildActivatedRoute(registeredParam) },
      ],
    });

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  describe('initial state', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('expands and collapses recovery instructions without submitting the form', () => {
      (authServiceSpy.recoveryRequired as ReturnType<typeof signal<boolean>>).set(true);
      fixture.detectChanges();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.recovery-toggle');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      button.click(); fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(fixture.nativeElement.querySelector('#recovery-help').textContent).toContain('revogação da sessão');
      button.click(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#recovery-help')).toBeNull();
      expect(authServiceSpy.login).not.toHaveBeenCalled();
    });

    it('should start with an invalid form', () => {
      expect(component.form.invalid).toBe(true);
    });

    it('should NOT show the success banner by default', () => {
      expect(component.justRegistered).toBe(false);
    });
  });

  describe('when ?registered=true is in the URL', () => {
    it('should show the success banner', () => {
      setup(true);
      expect(component.justRegistered).toBe(true);
    });
  });

  describe('form validation', () => {
    beforeEach(() => setup());

    it('should mark all fields as touched and not call login when form is empty', () => {
      component.onSubmit();
      expect(authServiceSpy.login).not.toHaveBeenCalled();
      expect(component.emailControl.touched).toBe(true);
      expect(component.passwordControl.touched).toBe(true);
    });

    it('should mark email as invalid when format is wrong', () => {
      component.form.setValue({ email: 'not-an-email', password: '12345678' });
      component.form.markAllAsTouched();
      expect(component.emailControl.hasError('email')).toBe(true);
    });
  });

  describe('onSubmit()', () => {
    beforeEach(() => setup());

    it('should call authService.login with correct credentials', () => {
      authServiceSpy.login.mockReturnValue(of(mockLoginResponse));
      jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.form.setValue({ email: 'joao@email.com', password: '12345678' });
      component.onSubmit();

      expect(authServiceSpy.login).toHaveBeenCalledWith({
        email: 'joao@email.com',
        password: '12345678',
      });
    });

    it('should navigate to /dashboard on success', () => {
      authServiceSpy.login.mockReturnValue(of(mockLoginResponse));
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.form.setValue({ email: 'joao@email.com', password: '12345678' });
      component.onSubmit();

      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should set errorMessage on login failure', () => {
      authServiceSpy.login.mockReturnValue(
        throwError(() => ({ status: 401, error: { message: 'Invalid email or password' } }))
      );

      component.form.setValue({ email: 'joao@email.com', password: 'wrong' });
      component.onSubmit();

      expect(component.errorMessage()).toBe('E-mail ou senha inválidos.');
      expect(component.isLoading()).toBe(false);
    });

    it('should use fallback error message when API returns no message', () => {
      authServiceSpy.login.mockReturnValue(throwError(() => ({ error: {} })));

      component.form.setValue({ email: 'joao@email.com', password: 'wrong' });
      component.onSubmit();

      expect(component.errorMessage()).toBe('Não foi possível concluir a solicitação. O resultado não foi confirmado.');
    });
  });

  describe('togglePassword()', () => {
    beforeEach(() => setup());

    it('should toggle showPassword signal', () => {
      expect(component.showPassword()).toBe(false);
      component.togglePassword();
      expect(component.showPassword()).toBe(true);
      component.togglePassword();
      expect(component.showPassword()).toBe(false);
    });
  });

  describe('H08 account states and submission controls', () => {
    beforeEach(() => setup());
    afterEach(() => jest.useRealTimers());
    const submitError = (status: number, body: unknown, retry?: string) => {
      authServiceSpy.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status, error: body,
        headers: new HttpHeaders(retry === undefined ? {} : { 'Retry-After': retry }) })));
      component.form.setValue({ email: 'joao@email.com', password: 'p' }); component.onSubmit(); fixture.detectChanges();
    };
    it.each([' ', '\t\n'])('rejects white-only passwords %j', password => {
      component.form.setValue({ email: 'joao@email.com', password }); component.onSubmit();
      expect(authServiceSpy.login).not.toHaveBeenCalled();
    });
    it('preserves spaces and permits a short nonblank login password', () => {
      authServiceSpy.login.mockReturnValue(of(mockLoginResponse)); jest.spyOn(router, 'navigate').mockResolvedValue(true);
      component.form.setValue({ email: 'joao@email.com', password: ' p ' }); component.onSubmit();
      expect(authServiceSpy.login).toHaveBeenCalledWith({ email: 'joao@email.com', password: ' p ' });
      expect(component.passwordControl.value).toBe('');
    });
    it.each([
      [403, { code: 'EMAIL_NOT_VERIFIED' }, 'Confirme seu e-mail', true],
      [403, { code: 'ACCOUNT_DISABLED' }, 'suporte', false],
      [403, { code: 'CSRF_PROTECTION_REQUIRED' }, 'proteção', false],
      [403, { code: 'UNRECOGNIZED', message: 'sensitive internal error' }, 'não foi confirmado', false],
      [0, {}, 'conexão', false],
      [500, {}, 'servidor', false]
    ])('presents only contracted state for %s %j', (status, body, message, resend) => {
      submitError(status as number, body);
      expect(component.errorMessage()).toContain(message);
      expect(component.canResendVerification()).toBe(resend);
      expect(fixture.nativeElement.textContent).not.toContain('sensitive internal error');
      expect(!!fixture.nativeElement.querySelector('a[href="/verify-email"]')).toBe(resend);
      expect(component.isLoading()).toBe(false);
    });
    it('blocks repeated submit in logic/button and releases waiting on error', () => {
      const result = new Subject<LoginResponse>(); authServiceSpy.login.mockReturnValue(result);
      component.form.setValue({ email: 'joao@email.com', password: 'p' }); component.onSubmit(); component.onSubmit(); fixture.detectChanges();
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
      result.error(new HttpErrorResponse({ status: 401, error: { message: 'Invalid email or password' } })); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    });
    it('respects an actual Retry-After without automatic resubmission', () => {
      jest.useFakeTimers(); submitError(429, {}, '2'); component.onSubmit();
      expect(component.retrySeconds()).toBe(2); expect(authServiceSpy.login).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(2001); expect(component.retrySeconds()).toBe(0);
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);
    });
    it('does not invent a cooldown when 429 omits Retry-After', () => {
      submitError(429, {}); expect(component.retrySeconds()).toBe(0); expect(component.errorMessage()).toContain('Aguarde');
    });
    it('offers instructions and blocks blind login for an uncertain operation', () => {
      TestBed.resetTestingModule();
      const recovery = signal(true);
      TestBed.configureTestingModule({ imports: [LoginComponent, RouterTestingModule], providers: [
        { provide: AuthService, useValue: { login: jest.fn(), cancelPendingLogin: jest.fn(), sessionMessage: signal('Resultado não confirmado'), recoveryRequired: recovery } },
        { provide: ActivatedRoute, useValue: buildActivatedRoute(false) }
      ] });
      const page = TestBed.createComponent(LoginComponent); page.detectChanges();
      expect(page.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
      page.componentInstance.showRecoveryHelp.set(true); page.detectChanges();
      expect(page.nativeElement.textContent).toContain('revogação da sessão no servidor'); page.destroy();
    });
    it('cancels the pending screen context and countdown on destroy', () => {
      jest.useFakeTimers(); submitError(429, {}, '10'); fixture.destroy();
      expect(authServiceSpy.cancelPendingLogin).toHaveBeenCalled();
      jest.advanceTimersByTime(11000); expect(component.retrySeconds()).toBe(10);
    });
  });
});
