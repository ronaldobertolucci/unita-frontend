import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { PocketsComponent } from './pockets/pockets.component';
import { CreditCardsComponent } from './credit-cards/credit-cards.component';
import { SessionService } from '../core/services/session.service';
import { syntheticSession } from '../core/testing/session.mock';
import { environment } from '../../environments/environment';

describe('US-01 registration flows with real frontend services', () => {
  let http: HttpTestingController;
  let session: SessionService;
  const base = environment.apiUrl;
  const entity = { id: 101, corporateName: 'Minha empresa', cnpj: '12345678000190' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PocketsComponent, CreditCardsComponent, RouterTestingModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    session.accept(syntheticSession(), session.version());
  });
  afterEach(() => http.verify());

  function pockets() {
    const fixture = TestBed.createComponent(PocketsComponent);
    fixture.detectChanges();
    http.expectOne(`${base}/pockets/my`).flush([]);
    return fixture;
  }

  function cards() {
    const fixture = TestBed.createComponent(CreditCardsComponent);
    fixture.detectChanges();
    http.expectOne(`${base}/credit-cards/my`).flush([]);
    fixture.componentInstance.openCreateModal();
    http.expectOne(`${base}/legal-entities`).flush([entity]);
    fixture.componentInstance.createForm.setValue({ legalEntityId: 101, cardBrandId: 1, lastFourDigits: '1234', creditLimit: 5000, closingDay: 10, dueDay: 20 });
    return fixture;
  }

  it.each(['BANK_ACCOUNT', 'BENEFIT_ACCOUNT'] as const)('clears unavailable PJ selection and refreshes personal options for %s', type => {
    const c = pockets().componentInstance;
    c.selectPocketType(type);
    http.expectOne(`${base}/legal-entities`).flush([entity]);
    const bank = type === 'BANK_ACCOUNT';
    if (bank) c.bankAccountForm.setValue({ legalEntityId: 101, number: '12345-6', agency: '0001', bankAccountTypeId: 1 });
    else c.benefitAccountForm.setValue({ legalEntityId: 101, benefitTypeId: 1 });
    if (bank) c.createBankAccount(); else c.createBenefitAccount();
    const req = http.expectOne(`${base}/pockets/${bank ? 'bank-accounts' : 'benefit-accounts'}`);
    expect(req.request.body.userId).toBeUndefined();
    req.flush({ message: 'Legal entity not found' }, { status: 404, statusText: 'Not Found' });
    expect(c.errorMessage()).toBe('Cadastro indisponível. Atualize a seleção.');
    expect((bank ? c.bankAccountForm : c.benefitAccountForm).value.legalEntityId).toBeNull();
    expect(c.legalEntities()).toEqual([]);
    http.expectOne(`${base}/legal-entities`).flush([]);
    http.expectNone(`${base}/pockets/my`);
  });

  it.each(['individual', 'legal-entity'] as const)('sends employer ID for %s FGTS and reloads both personal lists on 404', type => {
    const c = pockets().componentInstance;
    c.selectPocketType('FGTS_EMPLOYER_ACCOUNT');
    http.expectOne(`${base}/employers/individual`).flush([{ id: 201, name: 'Meu empregador', cpf: '12345678900' }]);
    http.expectOne(`${base}/employers/legal-entity`).flush([{ id: 202, legalEntity: entity }]);
    c.fgtsForm.setValue({ employerType: type, employerId: type === 'individual' ? 201 : 202, admissionDate: '2026-10-13', dismissalDate: '' });
    c.createFgts();
    const req = http.expectOne(`${base}/pockets/fgts`);
    expect(req.request.body).toEqual({ employerId: type === 'individual' ? 201 : 202, admissionDate: '2026-10-13' });
    req.flush({ message: 'Employer not found' }, { status: 404, statusText: 'Not Found' });
    expect(c.fgtsForm.value.employerId).toBeNull();
    expect(c.errorMessage()).toBe('Cadastro indisponível. Atualize a seleção.');
    http.expectOne(`${base}/employers/individual`).flush([]);
    http.expectOne(`${base}/employers/legal-entity`).flush([]);
  });

  it.each(['BANK_ACCOUNT', 'BENEFIT_ACCOUNT', 'FGTS_EMPLOYER_ACCOUNT'] as const)('refreshes pockets on successful %s creation', type => {
    const c = pockets().componentInstance;
    c.selectPocketType(type);
    let endpoint: string;
    if (type === 'FGTS_EMPLOYER_ACCOUNT') {
      http.expectOne(`${base}/employers/individual`).flush([{ id: 201, name: 'Meu empregador' }]);
      http.expectOne(`${base}/employers/legal-entity`).flush([]);
      c.fgtsForm.patchValue({ employerId: 201, admissionDate: '2026-10-13' });
      c.createFgts();
      endpoint = 'fgts';
    } else {
      http.expectOne(`${base}/legal-entities`).flush([entity]);
      if (type === 'BANK_ACCOUNT') {
        c.bankAccountForm.setValue({ legalEntityId: 101, number: '12345-6', agency: '0001', bankAccountTypeId: 1 });
        c.createBankAccount();
        endpoint = 'bank-accounts';
      } else {
        c.benefitAccountForm.setValue({ legalEntityId: 101, benefitTypeId: 1 });
        c.createBenefitAccount();
        endpoint = 'benefit-accounts';
      }
    }
    http.expectOne(`${base}/pockets/${endpoint}`).flush({ id: 301 });
    http.expectOne(`${base}/pockets/my`).flush([{ id: 301, type, label: 'Meu cadastro', balance: 0, active: true }]);
    expect(c.pockets()[0].id).toBe(301);
    expect(c.activeModal()).toBeNull();
  });

  it('shows field validation errors while preserving values for correction', () => {
    const c = cards().componentInstance;
    c.createCreditCard();
    http.expectOne(`${base}/credit-cards`).flush({ message: 'Invalid input data', errors: { closingDay: 'must be between 1 and 31' } }, { status: 400, statusText: 'Bad Request' });
    expect(c.errorMessage()).toContain('Dia de fechamento: must be between 1 and 31');
    expect(c.createForm.value.legalEntityId).toBe(101);
    expect(c.recovery.cards()).toBe('clear');
  });

  it('refreshes card personal options on unavailable PJ without retrying the POST', () => {
    const c = cards().componentInstance;
    c.createCreditCard();
    http.expectOne(`${base}/credit-cards`).flush({ message: 'Legal entity not found' }, { status: 404, statusText: 'Not Found' });
    expect(c.createForm.value.legalEntityId).toBeNull();
    expect(c.errorMessage()).toBe('Cadastro indisponível. Atualize a seleção.');
    http.expectOne(`${base}/legal-entities`).flush([]);
    http.expectNone(`${base}/credit-cards`);
  });

  it.each([0, 500])('blocks resubmission after uncertain card response (%s), including reopening and navigation', status => {
    const fixture = cards();
    const c = fixture.componentInstance;
    c.createCreditCard();
    c.createCreditCard();
    http.expectOne(`${base}/credit-cards`).flush({}, { status, statusText: 'Failure' });
    expect(c.recovery.cards()).toBe('checking');
    http.expectOne(`${base}/credit-cards/my`).flush({}, { status: 500, statusText: 'Failure' });
    expect(c.recovery.cards()).toBe('pending');
    c.recovery.confirm('cards');
    c.createCreditCard();
    http.expectNone(`${base}/credit-cards`);
    fixture.destroy();
    const fresh = cards().componentInstance;
    expect(fresh.recovery.cards()).toBe('pending');
    fresh.createCreditCard();
    http.expectNone(`${base}/credit-cards`);
    fresh.checkCreationResult();
    http.expectOne(`${base}/credit-cards/my`).flush([]);
    expect(fresh.recovery.cards()).toBe('review');
    fresh.createCreditCard();
    http.expectNone(`${base}/credit-cards`);
    fresh.recovery.confirm('cards');
    fresh.createCreditCard();
    http.expectOne(`${base}/credit-cards`).flush({ id: 401, legalEntityCorporateName: 'Minha empresa' });
    http.expectOne(`${base}/credit-cards/my`).flush([]);
  });

  it('consults pockets after a lost response and never automatically repeats creation', () => {
    const c = pockets().componentInstance;
    c.selectPocketType('BENEFIT_ACCOUNT');
    http.expectOne(`${base}/legal-entities`).flush([entity]);
    c.benefitAccountForm.setValue({ legalEntityId: 101, benefitTypeId: 1 });
    c.createBenefitAccount();
    c.createBenefitAccount();
    http.expectOne(`${base}/pockets/benefit-accounts`).flush({}, { status: 0, statusText: 'Unknown' });
    http.expectOne(`${base}/pockets/my`).flush([]);
    expect(c.recovery.pockets()).toBe('review');
    c.createBenefitAccount();
    http.expectNone(`${base}/pockets/benefit-accounts`);
  });

  it.each([400, 401, 403, 404])('keeps global reference/validation/auth errors (%s) distinct from personal 404', status => {
    const c = cards().componentInstance;
    c.createCreditCard();
    http.expectOne(`${base}/credit-cards`).flush({ message: status === 404 ? 'Card brand not found' : 'Invalid input data' }, { status, statusText: 'Rejected' });
    expect(c.createForm.value.legalEntityId).toBe(101);
    expect(c.recovery.cards()).toBe('clear');
    expect(c.errorMessage()).not.toBe('Cadastro indisponível. Atualize a seleção.');
    http.expectNone(`${base}/legal-entities`);
  });

  it('clears options, selections, details and pending requests synchronously on account change', () => {
    const p = pockets().componentInstance;
    p.selectPocketType('BANK_ACCOUNT');
    const stale = http.expectOne(`${base}/legal-entities`);
    const c = cards().componentInstance;
    c.recovery.mark('cards');
    session.invalidate('login', 'unknown');
    session.accept(syntheticSession(2), session.version());
    expect(stale.cancelled).toBe(true);
    expect(c.legalEntities()).toEqual([]);
    expect(c.createForm.value.legalEntityId).toBeNull();
    expect(c.activeModal()).toBeNull();
    expect(p.legalEntities()).toEqual([]);
    expect(p.individualEmployers()).toEqual([]);
    expect(p.legalEntityEmployers()).toEqual([]);
    expect(p.bankAccountForm.value.legalEntityId).toBeNull();
    expect(p.activeModal()).toBeNull();
    expect(c.recovery.cards()).toBe('clear');
  });

  it('refreshes cards after success without creating a bill in the client', () => {
    const c = cards().componentInstance;
    c.createCreditCard();
    http.expectOne(`${base}/credit-cards`).flush({ id: 401, legalEntityCorporateName: 'Minha empresa' });
    http.expectOne(`${base}/credit-cards/my`).flush([{ id: 401, legalEntityCorporateName: 'Minha empresa' }]);
    expect(c.creditCards()[0].id).toBe(401);
    expect(c.activeModal()).toBeNull();
    http.expectNone(req => req.method === 'POST' && req.url.includes('/bills'));
  });
});
