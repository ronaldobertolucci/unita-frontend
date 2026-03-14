import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ResetPasswordComponent } from './reset-password.component';
import { environment } from '../../../../environments/environment';

function buildActivatedRoute(token: string | null) {
  return {
    snapshot: {
      queryParamMap: {
        get: (key: string) => (key === 'token' ? token : null),
      },
    },
  };
}

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let component: ResetPasswordComponent;
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: buildActivatedRoute(token) },
      ],
    });

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  describe('when no token in URL', () => {
    it('should set state to invalid-token immediately', () => {
      setup(null);
      fixture.detectChanges();
      expect(component.pageState()).toBe('invalid-token');
      httpMock.expectNone(`${environment.apiUrl}/password/reset/validate`);
    });
  });

  describe('when token is present in URL', () => {
    beforeEach(() => setup('valid-token'));

    it('should start with validating state', () => {
      // Antes de detectChanges (ngOnInit ainda não rodou)
      expect(component.pageState()).toBe('validating');
    });

    it('should set state to form after successful token validation', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(
        `${environment.apiUrl}/password/reset/validate?token=valid-token`
      );
      req.flush({});
      expect(component.pageState()).toBe('form');
    });

    it('should set state to invalid-token when token validation fails', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(
        `${environment.apiUrl}/password/reset/validate?token=valid-token`
      );
      req.flush({ message: 'Token inválido' }, { status: 400, statusText: 'Bad Request' });
      expect(component.pageState()).toBe('invalid-token');
    });
  });

  describe('form validation', () => {
    beforeEach(() => {
      setup('valid-token');
      fixture.detectChanges();
      // Confirma token como válido
      httpMock
        .expectOne(`${environment.apiUrl}/password/reset/validate?token=valid-token`)
        .flush({});
    });

    it('should not submit when form is empty', () => {
      component.onSubmit();
      httpMock.expectNone(`${environment.apiUrl}/password/reset`);
      expect(component.newPasswordControl.touched).toBe(true);
    });

    it('should show minlength error when password is too short', () => {
      component.form.patchValue({ newPassword: '123' });
      component.form.markAllAsTouched();
      expect(component.newPasswordControl.hasError('minlength')).toBe(true);
    });

    it('should show passwordMismatch error when passwords differ', () => {
      component.form.patchValue({ newPassword: '12345678', confirmPassword: 'different' });
      component.confirmPasswordControl.markAsTouched();
      expect(component.hasPasswordMismatch).toBe(true);
    });
  });

  describe('onSubmit()', () => {
    beforeEach(() => {
      setup('valid-token');
      fixture.detectChanges();
      httpMock
        .expectOne(`${environment.apiUrl}/password/reset/validate?token=valid-token`)
        .flush({});
    });

    it('should call POST /password/reset with token and new password', () => {
      component.form.setValue({ newPassword: 'newpass123', confirmPassword: 'newpass123' });
      component.onSubmit();

      const req = httpMock.expectOne(`${environment.apiUrl}/password/reset`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ token: 'valid-token', newPassword: 'newpass123' });
      req.flush({});
    });

    it('should set state to success after successful reset', () => {
      component.form.setValue({ newPassword: 'newpass123', confirmPassword: 'newpass123' });
      component.onSubmit();

      httpMock.expectOne(`${environment.apiUrl}/password/reset`).flush({});

      expect(component.pageState()).toBe('success');
    });

    it('should set errorMessage on reset failure', () => {
      component.form.setValue({ newPassword: 'newpass123', confirmPassword: 'newpass123' });
      component.onSubmit();

      httpMock
        .expectOne(`${environment.apiUrl}/password/reset`)
        .flush({ message: 'Token expirado' }, { status: 400, statusText: 'Bad Request' });

      expect(component.errorMessage()).toBe('Token expirado');
      expect(component.pageState()).toBe('form');
    });
  });
});