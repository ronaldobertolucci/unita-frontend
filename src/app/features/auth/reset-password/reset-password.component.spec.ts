import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../../core/services/auth.service';

 describe('H11 reset password state machine', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>, component: ResetPasswordComponent;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let validation: Subject<{ message: string }>, reset: Subject<{ message: string }>;
  let auth: { validateResetToken: jest.Mock; resetPassword: jest.Mock };
  function setup(token?: string | string[]) {
    params = new BehaviorSubject(convertToParamMap(token === undefined ? {} : { token }));
    validation = new Subject(); reset = new Subject();
    auth = { validateResetToken: jest.fn().mockReturnValue(validation), resetPassword: jest.fn().mockReturnValue(reset) };
    TestBed.configureTestingModule({ imports: [ResetPasswordComponent, RouterTestingModule], providers: [
      { provide: AuthService, useValue: auth }, { provide: ActivatedRoute, useValue: { queryParamMap: params } }
    ] });
    fixture = TestBed.createComponent(ResetPasswordComponent); component = fixture.componentInstance; fixture.detectChanges();
  }
  const valid = () => { validation.next({ message: 'Token is valid' }); validation.complete(); };
  const submit = (password = ' exact password ') => {
    component.form.setValue({ newPassword: password, confirmPassword: password }); component.onSubmit();
  };
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });
  it.each([undefined, '', ' ', ['a', 'b']])('blocks an absent/blank/duplicate token %j and explains reload', token => {
    setup(token); expect(component.pageState()).toBe('invalid-token'); expect(auth.validateResetToken).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('Reabra o link'); submit(); expect(auth.resetPassword).not.toHaveBeenCalled();
  });
  it('never posts before validation and sends only the exact new password with token', () => {
    setup('opaque+/='); submit(); expect(auth.resetPassword).not.toHaveBeenCalled(); valid(); submit();
    expect(auth.resetPassword).toHaveBeenCalledWith({ token: 'opaque+/=', newPassword: ' exact password ' });
    component.onSubmit(); expect(auth.resetPassword).toHaveBeenCalledTimes(1);
    reset.next({ message: 'reset' }); reset.complete(); expect(component.pageState()).toBe('success');
    expect(component.newPasswordControl.value).toBeNull(); expect(component['token']).toBeNull();
  });
  it.each(['1234567', '        '])('rejects invalid new password %j', password => {
    setup('token'); valid(); submit(password); expect(auth.resetPassword).not.toHaveBeenCalled();
  });
  it('rejects mismatched confirmation and allows an eight-character password', () => {
    setup('token'); valid(); component.form.setValue({ newPassword: '12345678', confirmPassword: 'different' }); component.onSubmit();
    expect(component.hasPasswordMismatch).toBe(true); expect(auth.resetPassword).not.toHaveBeenCalled(); submit('12345678'); expect(auth.resetPassword).toHaveBeenCalledTimes(1);
  });
  it('permits explicit readonly revalidation after a transient failure, without an automatic request', () => {
    setup('token'); validation.error({ status: 500 }); expect(component.pageState()).toBe('validation-error');
    expect(auth.validateResetToken).toHaveBeenCalledTimes(1); auth.validateResetToken.mockReturnValue(of({ message: 'valid' }));
    component.revalidate(); expect(component.pageState()).toBe('form'); expect(auth.validateResetToken).toHaveBeenCalledTimes(2);
  });
  it('ends the flow when token is rejected during validation or between validation and reset', () => {
    setup('token'); valid(); submit(); reset.error({ status: 400, error: { error: 'Invalid Token', message: 'Token expired or already used' } });
    expect(component.pageState()).toBe('invalid-token'); expect(component['token']).toBeNull(); component.onSubmit(); expect(auth.resetPassword).toHaveBeenCalledTimes(1);
  });
  it('maps newPassword validation and permits correcting that field', () => {
    setup('token'); valid(); submit(); reset.error({ status: 400, error: { error: 'Validation Failed', errors: [{ field: 'newPassword', message: 'internal' }] } });
    expect(component.pageState()).toBe('form'); expect(component.newPasswordControl.hasError('api')).toBe(true);
    component.newPasswordControl.setValue('corrected password'); expect(component.newPasswordControl.hasError('api')).toBe(false);
  });
  it.each([0, 500, 400, 429])('does not allow reset retry after unknown HTTP %s', status => {
    setup('token'); valid(); submit(); reset.error({ status, error: { message: 'unknown' } });
    expect(component.pageState()).toBe('uncertain'); expect(component.errorMessage()).toContain('pode ter sido alterada');
    expect(component['token']).toBeNull(); component.onSubmit(); expect(auth.resetPassword).toHaveBeenCalledTimes(1);
  });
  it('link changes and leaving suppress old validation/reset callbacks and clear fields', () => {
    setup('old'); const old = validation; validation = new Subject(); auth.validateResetToken.mockReturnValue(validation);
    params.next(convertToParamMap({ token: 'new' })); old.next({ message: 'old valid' }); expect(component.pageState()).toBe('validating');
    valid(); submit(); fixture.destroy(); reset.next({ message: 'late' }); expect(component.pageState()).not.toBe('success'); expect(component['token']).toBeNull();
  });
});
