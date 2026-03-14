import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ForgotPasswordComponent } from './forgot-password.component';
import { environment } from '../../../../environments/environment';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let component: ForgotPasswordComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent, HttpClientTestingModule, RouterTestingModule],
    });

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should start with submitted = false', () => {
    expect(component.submitted()).toBe(false);
  });

  describe('form validation', () => {
    it('should not submit when email is empty', () => {
      component.onSubmit();
      httpMock.expectNone(`${environment.apiUrl}/password/forgot`);
      expect(component.emailControl.touched).toBe(true);
    });

    it('should mark email as invalid when format is wrong', () => {
      component.form.setValue({ email: 'not-valid' });
      component.form.markAllAsTouched();
      expect(component.emailControl.hasError('email')).toBe(true);
    });
  });

  describe('onSubmit()', () => {
    it('should call POST /password/forgot with the email', () => {
      component.form.setValue({ email: 'joao@email.com' });
      component.onSubmit();

      const req = httpMock.expectOne(`${environment.apiUrl}/password/forgot`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'joao@email.com' });
      req.flush({});
    });

    it('should set submitted = true on success', () => {
      component.form.setValue({ email: 'joao@email.com' });
      component.onSubmit();

      const req = httpMock.expectOne(`${environment.apiUrl}/password/forgot`);
      req.flush({});

      expect(component.submitted()).toBe(true);
    });

    it('should set errorMessage on API error', () => {
      component.form.setValue({ email: 'joao@email.com' });
      component.onSubmit();

      const req = httpMock.expectOne(`${environment.apiUrl}/password/forgot`);
      req.flush(
        { message: 'Erro interno' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(component.errorMessage()).toBe('Erro interno');
      expect(component.submitted()).toBe(false);
    });
  });
});