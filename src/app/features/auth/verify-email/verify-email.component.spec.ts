import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { VerifyEmailComponent } from './verify-email.component';
import { AuthService } from '../../../core/services/auth.service';
import { Location } from '@angular/common';

 describe('H10 confirmation and neutral resend', () => {
  let fixture: ComponentFixture<VerifyEmailComponent>, component: VerifyEmailComponent;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let auth: { verifyEmail: jest.Mock; resendVerification: jest.Mock };
  function setup(token?: string | string[], result = new Subject<void>()) {
    params = new BehaviorSubject(convertToParamMap(token === undefined ? {} : { token }));
    auth = { verifyEmail: jest.fn().mockReturnValue(result), resendVerification: jest.fn().mockReturnValue(of(undefined)) };
    TestBed.configureTestingModule({ imports: [VerifyEmailComponent, RouterTestingModule], providers: [
      { provide: AuthService, useValue: auth }, { provide: ActivatedRoute, useValue: { queryParamMap: params } }
    ] });
    jest.spyOn(TestBed.inject(Location), 'replaceState');
    fixture = TestBed.createComponent(VerifyEmailComponent); component = fixture.componentInstance; fixture.detectChanges();
    return result;
  }
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });
  it.each([undefined, '', '  ', ['a', 'b']])('does not consume an absent/blank/duplicate token %j', token => {
    setup(token); expect(auth.verifyEmail).not.toHaveBeenCalled(); expect(component.pageState()).toBe('resend');
  });
  it('scrubs before consuming, preserves opaque characters and navigates to login on 200', () => {
    const result = setup('opaque+/= token'); const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(TestBed.inject(Location).replaceState).toHaveBeenCalledWith('/verify-email', '');
    expect(auth.verifyEmail).toHaveBeenCalledWith('opaque+/= token'); result.next();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { verified: true } });
  });
  it.each([
    [400, { error: 'Bad Request', message: 'Invalid verification token' }, 'inválido'],
    [409, { error: 'Conflict', message: 'Token has already been used' }, 'utilizado'],
    [409, { error: 'Conflict', message: 'Token has expired' }, 'expirou'],
    [0, {}, 'conexão'], [500, {}, 'servidor'], [409, { message: 'unknown' }, 'não foi confirmado']
  ])('shows only contracted confirmation feedback for %s', (status, body, message) => {
    const result = setup('token'); result.error({ status, error: body });
    expect(component.errorMessage()).toContain(message); expect(component.pageState()).toBe('resend');
    expect(auth.verifyEmail).toHaveBeenCalledTimes(1);
  });
  it('drops the old link reply and cancels after leaving', () => {
    const old = setup('old'), latest = new Subject<void>(); auth.verifyEmail.mockReturnValue(latest);
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    params.next(convertToParamMap({ token: 'new' })); old.next(); expect(navigate).not.toHaveBeenCalled();
    fixture.destroy(); latest.next(); expect(navigate).not.toHaveBeenCalled();
  });
  it.each(['nonexistent', 'confirmed', 'disabled', 'pending'])('renders the same neutral result for server state %s', () => {
    setup(); component.resendForm.setValue({ email: 'synthetic@example.com' }); component.submitResend(); fixture.detectChanges();
    expect(component.pageState()).toBe('resend-sent'); expect(fixture.nativeElement.textContent).toContain('conta elegível');
    expect(fixture.nativeElement.textContent).not.toContain('em instantes'); expect(fixture.nativeElement.textContent).not.toContain('já foi verificado');
  });
  it('never interprets a resend 409 as email confirmation', () => {
    setup(); auth.resendVerification.mockReturnValue(throwError(() => ({ status: 409 })));
    component.resendForm.setValue({ email: 'synthetic@example.com' }); component.submitResend();
    expect(component.errorMessage()).toContain('não foi confirmado'); expect(component.pageState()).toBe('resend');
  });
  it('blocks duplicate resend and discards its result when the link changes', () => {
    setup(); const resend = new Subject<void>(); auth.resendVerification.mockReturnValue(resend);
    component.resendForm.setValue({ email: 'synthetic@example.com' }); component.submitResend(); component.submitResend();
    expect(auth.resendVerification).toHaveBeenCalledTimes(1);
    params.next(convertToParamMap({ token: 'new' })); resend.next(); expect(component.pageState()).toBe('verifying');
  });
  it('maps email field validation and does not send an invalid form', () => {
    setup(); component.submitResend(); expect(auth.resendVerification).not.toHaveBeenCalled();
    auth.resendVerification.mockReturnValue(throwError(() => ({ status: 400, error: { error: 'Validation Failed', errors: [{ field: 'email' }] } })));
    component.resendForm.setValue({ email: 'synthetic@example.com' }); component.submitResend(); expect(component.emailControl.hasError('api')).toBe(true);
  });
});
