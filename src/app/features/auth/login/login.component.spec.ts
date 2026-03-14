import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';

const mockLoginResponse = {
  token: 'fake-token',
  user: { id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@email.com', dateOfBirth: '1990-01-01' },
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
  let authServiceSpy: jest.Mocked<Pick<AuthService, 'login'>>;
  let router: Router;

  function setup(registeredParam = false) {
    authServiceSpy = { login: jest.fn() };

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
        throwError(() => ({ error: { message: 'Credenciais inválidas' } }))
      );

      component.form.setValue({ email: 'joao@email.com', password: 'wrong' });
      component.onSubmit();

      expect(component.errorMessage()).toBe('Credenciais inválidas');
      expect(component.isLoading()).toBe(false);
    });

    it('should use fallback error message when API returns no message', () => {
      authServiceSpy.login.mockReturnValue(throwError(() => ({ error: {} })));

      component.form.setValue({ email: 'joao@email.com', password: 'wrong' });
      component.onSubmit();

      expect(component.errorMessage()).toBe('Ocorreu um erro. Tente novamente.');
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
});