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
      req.flush({ message: 'neutral' });
    });

    it('should set submitted = true on success', () => {
      component.form.setValue({ email: 'joao@email.com' });
      component.onSubmit();

      const req = httpMock.expectOne(`${environment.apiUrl}/password/forgot`);
      req.flush({ message: 'neutral' });

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

      expect(component.errorMessage()).toContain('servidor');
      expect(component.submitted()).toBe(false);
    });
  });
  it('does not accept malformed success or auto-repeat a lost request', () => {
    component.form.setValue({ email: 'test@example.com' }); component.onSubmit(); component.onSubmit();
    httpMock.expectOne('/api/password/forgot').flush({});
    expect(component.submitted()).toBe(false); expect(component.errorMessage()).toContain('não foi confirmado');
    httpMock.expectNone('/api/password/forgot');
  });
  it('maps email validation without inferring whether an account exists', () => {
    component.form.setValue({ email: 'test@example.com' }); component.onSubmit();
    httpMock.expectOne('/api/password/forgot').flush({ error: 'Validation Failed', errors: [{ field: 'email' }] }, { status: 400, statusText: 'Bad Request' });
    expect(component.emailControl.hasError('api')).toBe(true); expect(component.submitted()).toBe(false);
  });
  it('uses neutral success without an email echo or delivery deadline', () => {
    component.form.setValue({ email: 'test@example.com' }); component.onSubmit();
    httpMock.expectOne('/api/password/forgot').flush({ message: 'neutral' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('test@example.com');
    expect(fixture.nativeElement.textContent).not.toContain('em breve');
    expect(fixture.nativeElement.textContent).toContain('links de redefinição anteriores são invalidados');
  });

});