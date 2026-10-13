import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';

const mockUser = {
  id: 1,
  firstName: 'João',
  lastName: 'Silva',
  email: 'joao@email.com',
  dateOfBirth: '2000-01-01',
  enabled: true,
  emailVerified: false,
  roles: ['ROLE_USER'],
};

const validFormValue = {
  firstName: 'João',
  lastName: 'Silva',
  email: 'joao@email.com',
  dateOfBirth: '2000-01-01',
  password: '12345678',
  confirmPassword: '12345678',
};

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let authServiceSpy: jest.Mocked<Pick<AuthService, 'register'>>;
  let router: Router;

  beforeEach(() => {
    authServiceSpy = { register: jest.fn() };

    TestBed.configureTestingModule({
      imports: [RegisterComponent, RouterTestingModule],
      providers: [{ provide: AuthService, useValue: authServiceSpy }],
    });

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should start with an invalid form', () => {
    expect(component.form.invalid).toBe(true);
  });

  describe('form validation', () => {
    it('should mark all fields as touched and not call register when form is empty', () => {
      component.onSubmit();
      expect(authServiceSpy.register).not.toHaveBeenCalled();
      expect(component.firstNameControl.touched).toBe(true);
    });

    it('should show email error when format is wrong', () => {
      component.form.patchValue({ email: 'invalid' });
      component.form.markAllAsTouched();
      expect(component.emailControl.hasError('email')).toBe(true);
    });

    it('should show password minlength error when password is too short', () => {
      component.form.patchValue({ password: '123' });
      component.form.markAllAsTouched();
      expect(component.passwordControl.hasError('minlength')).toBe(true);
    });

    it('should show passwordMismatch error when passwords differ', () => {
      component.form.patchValue({ password: '12345678', confirmPassword: 'different' });
      component.confirmPasswordControl.markAsTouched();
      expect(component.hasPasswordMismatch).toBe(true);
    });

    it('should NOT show passwordMismatch when passwords match', () => {
      component.form.patchValue({ password: '12345678', confirmPassword: '12345678' });
      component.confirmPasswordControl.markAsTouched();
      expect(component.hasPasswordMismatch).toBe(false);
    });
  });

  describe('onSubmit()', () => {
    it('should call authService.register with correct data', () => {
      authServiceSpy.register.mockReturnValue(of(mockUser));
      jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.form.setValue(validFormValue);
      component.onSubmit();

      expect(authServiceSpy.register).toHaveBeenCalledWith({
        firstName: 'João',
        lastName: 'Silva',
        email: 'joao@email.com',
        dateOfBirth: '2000-01-01',
        password: '12345678',
      });
    });

    it('should navigate to /login?registered=true on success', () => {
      authServiceSpy.register.mockReturnValue(of(mockUser));
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.form.setValue(validFormValue);
      component.onSubmit();

      expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
        queryParams: { registered: true },
      });
    });

    it('should set errorMessage from API message on error', () => {
      authServiceSpy.register.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: 'Email already registered' } }))
      );

      component.form.setValue(validFormValue);
      component.onSubmit();

      expect(component.errorMessage()).toBe('Este e-mail já está cadastrado.');
      expect(component.isLoading()).toBe(false);
    });

    it('ignores raw details and shows a safe fallback for an unknown envelope', () => {
      authServiceSpy.register.mockReturnValue(
        throwError(() => ({
          error: { message: 'Validation Failed', details: ['campo1: erro', 'campo2: erro'] },
        }))
      );

      component.form.setValue(validFormValue);
      component.onSubmit();

      expect(component.errorMessage()).toContain('resultado não foi confirmado');
    });
  });

  describe('togglePassword()', () => {
    it('should toggle showPassword signal', () => {
      expect(component.showPassword()).toBe(false);
      component.togglePassword();
      expect(component.showPassword()).toBe(true);
    });

    it('should toggle showConfirmPassword signal', () => {
      expect(component.showConfirmPassword()).toBe(false);
      component.toggleConfirmPassword();
      expect(component.showConfirmPassword()).toBe(true);
    });
  });
  it.each([
    ['firstName', 'A'], ['firstName', '  '], ['firstName', 'A'.repeat(101)],
    ['lastName', 'Z'], ['lastName', 'Z'.repeat(101)], ['email', 'a'.repeat(244) + '@example.com'],
    ['dateOfBirth', '2025-02-29'], ['dateOfBirth', '2026-10-13'], ['dateOfBirth', '2099-01-01'],
    ['password', '1234567'], ['password', '        ']
  ])('rejects the invalid boundary for %s', (field, value) => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 13, 23, 30));
    component.form.setValue(validFormValue); component.form.get(field)!.setValue(value);
    component.onSubmit(); expect(authServiceSpy.register).not.toHaveBeenCalled(); jest.useRealTimers();
  });
  it('accepts 2/100 character names and exact spaced eight-character password', () => {
    authServiceSpy.register.mockReturnValue(of(mockUser)); jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.form.setValue({ ...validFormValue, firstName: 'AB', lastName: 'Z'.repeat(100), password: ' pass123 ', confirmPassword: ' pass123 ' });
    component.onSubmit(); expect(authServiceSpy.register.mock.calls[0][0].password).toBe(' pass123 ');
    expect(component.passwordControl.value).toBeNull();
  });
  it('maps API fields and allows correcting the birth date without showing internal messages', () => {
    authServiceSpy.register.mockReturnValue(throwError(() => ({ status: 400, error: { error: 'Validation Failed', errors: [{ field: 'dateOfBirth', message: 'internal clock detail' }] } })));
    component.form.setValue(validFormValue); component.onSubmit(); fixture.detectChanges();
    expect(component.dateOfBirthControl.getError('api')).toContain('servidor');
    expect(fixture.nativeElement.textContent).not.toContain('internal clock detail');
    component.dateOfBirthControl.setValue('1999-01-01'); expect(component.dateOfBirthControl.hasError('api')).toBe(false);
  });
  it('prevents duplicate requests and cancels its subscriber on exit', () => {
    const pending = new Subject<typeof mockUser>(); authServiceSpy.register.mockReturnValue(pending);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.form.setValue(validFormValue); component.onSubmit(); component.onSubmit();
    expect(authServiceSpy.register).toHaveBeenCalledTimes(1); fixture.destroy(); pending.next(mockUser);
    expect(navigate).not.toHaveBeenCalled();
  });

});
