import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { VerifyEmailComponent } from './verify-email/verify-email.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

describe('H13 authentication semantics and focus', () => {
  const auth = {
    login: jest.fn(), register: jest.fn(), forgotPassword: jest.fn(), verifyEmail: jest.fn(), resendVerification: jest.fn(),
    validateResetToken: jest.fn(() => of({ message: 'valid' })), resetPassword: jest.fn(), cancelPendingLogin: jest.fn(),
    sessionMessage: signal<string | null>(null), recoveryRequired: signal(false)
  };
  afterEach(() => { TestBed.resetTestingModule(); jest.useRealTimers(); });
  it.each([LoginComponent, RegisterComponent, ForgotPasswordComponent, VerifyEmailComponent, ResetPasswordComponent])('associates labels/errors and focuses invalid fields for %p', component => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({ imports: [component, RouterTestingModule], providers: [
      { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap(component === ResetPasswordComponent ? { token: 'synthetic' } : {})) } }
    ] });
    const fixture = TestBed.createComponent(component as typeof LoginComponent); fixture.detectChanges(); jest.advanceTimersByTime(0);
    const main = fixture.nativeElement.querySelector('main'); expect(main.getAttribute('aria-labelledby')).toBe('auth-title');
    expect(document.activeElement).toBe(main.querySelector('h1, h2'));
    const form: HTMLFormElement = main.querySelector('form'); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges(); jest.advanceTimersByTime(0);
    const inputs: HTMLInputElement[] = Array.from(main.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(main.querySelector(`label[for="${input.id}"]`)).not.toBeNull(); expect(input.autocomplete).not.toBe('');
      if (input.getAttribute('aria-invalid') === 'true') {
        const id = input.getAttribute('aria-describedby'); expect(id).toBeTruthy(); expect(main.querySelector(`#${id}`)?.textContent?.trim()).toBeTruthy();
      }
    }
    expect(document.activeElement).toBe(main.querySelector('input[aria-invalid="true"]'));
    for (const button of main.querySelectorAll('button.btn-eye')) {
      expect(button.tabIndex).toBeGreaterThanOrEqual(0); expect(button.getAttribute('aria-label')).toBeTruthy(); expect(button.getAttribute('aria-pressed')).toBe('false');
      button.click(); fixture.detectChanges(); expect(button.getAttribute('aria-pressed')).toBe('true');
    }
    fixture.destroy();
  });
  it('announces server feedback and busy/success states without stealing focus on each edit', async () => {
    TestBed.configureTestingModule({ imports: [ForgotPasswordComponent, RouterTestingModule], providers: [{ provide: AuthService, useValue: auth }] });
    const pending = new Subject<{ message: string }>(); auth.forgotPassword.mockReturnValue(pending);
    const fixture = TestBed.createComponent(ForgotPasswordComponent); fixture.detectChanges();
    fixture.componentInstance.form.setValue({ email: 'synthetic@example.com' }); fixture.componentInstance.onSubmit(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form').getAttribute('aria-busy')).toBe('true');
    pending.error({ status: 500, error: { message: 'private internal data' } }); fixture.detectChanges(); await Promise.resolve();
    const alert = fixture.nativeElement.querySelector('#auth-feedback'); expect(alert.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(alert); expect(fixture.nativeElement.textContent).not.toContain('private internal data');
    const input = fixture.nativeElement.querySelector('input'); input.focus(); fixture.componentInstance.emailControl.setValue('different@example.com'); fixture.detectChanges(); await Promise.resolve();
    expect(document.activeElement).toBe(input); fixture.destroy();
  });
});
