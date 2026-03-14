import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';

const mockUser = {
  id: 1,
  firstName: 'João',
  lastName: 'Silva',
  email: 'joao@email.com',
  dateOfBirth: '2000-01-01',
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
        throwError(() => ({ error: { message: 'E-mail já cadastrado' } }))
      );

      component.form.setValue(validFormValue);
      component.onSubmit();

      expect(component.errorMessage()).toBe('E-mail já cadastrado');
      expect(component.isLoading()).toBe(false);
    });

    it('should join validation details with " • " when API returns details array', () => {
      authServiceSpy.register.mockReturnValue(
        throwError(() => ({
          error: { message: 'Validation Failed', details: ['campo1: erro', 'campo2: erro'] },
        }))
      );

      component.form.setValue(validFormValue);
      component.onSubmit();

      expect(component.errorMessage()).toBe('campo1: erro • campo2: erro');
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
});