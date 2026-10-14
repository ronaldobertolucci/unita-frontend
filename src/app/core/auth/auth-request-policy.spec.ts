import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AUTH_SESSION_OPTIONS, classifyAuthRequest } from './auth-request-policy';

const origin = 'https://unita.rws.home/';
const classify = (path: string, method = 'GET', api = '/api') => classifyAuthRequest(path, method, api, origin);

describe('Unita HTTP destination policy', () => {
  it.each([
    ['POST', '/api/auth/login'], ['POST', '/api/auth/refresh'], ['POST', '/api/auth/logout']
  ])('classifies %s %s as a cookie session operation', (method, path) => {
    expect(classify(path, method)).toBe('session');
  });

  it.each([
    ['POST', '/api/auth/register'], ['GET', '/api/auth/verify-email?token=a%2Fb%3D'],
    ['POST', '/api/auth/resend-verification'], ['POST', '/api/password/forgot'],
    ['GET', '/api/password/reset/validate?token=opaque'], ['POST', '/api/password/reset']
  ])('keeps %s %s public', (method, path) => {
    expect(classify(path, method)).toBe('public');
  });

  it.each([
    ['GET', '/api/auth/me'], ['GET', '/api/dashboard/monthly?year=2026'],
    ['GET', '/api/pockets/my'], ['POST', '/api/pockets/bank-accounts'],
    ['PUT', '/api/pockets/benefit-accounts/2'], ['DELETE', '/api/pockets/fgts/1'],
    ['GET', '/api/pockets/cash'], ['POST', '/api/pockets/1/transactions'],
    ['DELETE', '/api/pockets/1/transactions/2'], ['POST', '/api/transfers'],
    ['POST', '/api/transfers/fgts/withdrawal'], ['PATCH', '/api/credit-cards/2'],
    ['PUT', '/api/credit-cards/1/bills/2/pay'], ['PUT', '/api/credit-cards/1/bills/2/reopen'],
    ['POST', '/api/credit-cards/1/bills/2/refunds'],
    ['PUT', '/api/credit-cards/1/purchases/2/installments/3'],
    ['GET', '/api/credit-cards/1/purchases/2'], ['PUT', '/api/credit-cards/1/purchases/2'],
    ['GET', '/api/assets'], ['POST', '/api/assets/fixed-income'],
    ['PATCH', '/api/assets/1/position'], ['POST', '/api/assets/1/transactions/sell'],
    ['GET', '/api/groups/my/responsible'], ['PUT', '/api/groups/1/transfer'],
    ['GET', '/api/groups/1/dashboard/net-profit'], ['GET', '/api/groups/1/share/pockets'],
    ['PUT', '/api/groups/1/share/permissions'], ['GET', '/api/invitations/my/pending'],
    ['PUT', '/api/invitations/1/respond'], ['PATCH', '/api/categories/1'],
    ['GET', '/api/legal-entities/1'], ['PATCH', '/api/employers/individual/1'],
    ['POST', '/api/employers/legal-entity'], ['GET', '/api/admin/card-brands'],
    ['DELETE', '/api/admin/categories/1'], ['GET', '/api/notifications/stream']
  ])('allows the contracted resource %s %s', (method, path) => {
    expect(classify(path, method)).toBe('protected');
  });

  it.each([
    ['GET', '/api/auth/login'], ['POST', '/api/auth/me'], ['GET', '/api/password/reset'],
    ['HEAD', '/api/auth/me'], ['OPTIONS', '/api/auth/login'],
    ['GET', '/api/groups-archive/1'], ['GET', '/api/assets/1/photo.png'],
    ['GET', '/api/assets/1/unknown'], ['GET', '/api/admin/users'],
    ['POST', '/api/credit-cards/1/purchases/2/installments'],
    ['DELETE', '/api/transfers'], ['GET', '/api/pockets/-1/balance'],
    ['GET', '/api/pockets/0/balance'], ['GET', '/api/pockets/1.5/balance'],
    ['GET', '/assets/avatar.png'], ['GET', '/apiary/auth/me'],
    ['GET', 'https://elsewhere.example/api/auth/me'],
    ['POST', 'https://elsewhere.example/api/auth/login'],
    ['GET', 'https://elsewhere.example/?next=/api/auth/me'],
    ['GET', 'http://unita.rws.home/api/auth/me'], ['GET', 'https://unita.rws.home:8443/api/auth/me'],
    ['GET', 'https://user:secret@unita.rws.home/api/auth/me'],
    ['GET', '//unita.rws.home/api/auth/me'], ['GET', 'https:///unita.rws.home/api/auth/me'],
    ['GET', '/api/%61uth/me'], ['GET', '/api/foo/../auth/me'],
    ['GET', '/api/%2e/auth/me'], ['GET', '/api/auth\\me'],
    ['GET', '/api/auth/me#fragment'], ['GET', '/api/auth/me/'], ['GET', '/api//auth/me']
  ])('keeps ambiguous, unknown or untrusted request %s %s credential-free', (method, path) => {
    expect(classify(path, method)).toBe('other');
  });

  it('supports an explicit API origin/prefix and ignores query contents for classification', () => {
    const api = 'https://api.rws.home:8443/gateway/api/';
    expect(classify('https://api.rws.home:8443/gateway/api/auth/me?next=https%3A%2F%2Foutside.example', 'GET', api)).toBe('protected');
    expect(classify('/api/auth/me', 'GET', api)).toBe('other');
    expect(classify('https://api.rws.home:8443/gateway/api/auth/refresh', 'POST', api)).toBe('session');
  });

  it.each(['/', 'api', '//api.rws.home/api', 'https://[', '/api?x=1', '/api#x', '/api/../other', '/%61pi', 'file:///api'])('rejects an invalid API base %s', api => {
    expect(classify('/api/auth/me', 'GET', api)).toBe('other');
  });

  it('supports the same-origin local HTTP topology without changing endpoint policy', () => {
    expect(classifyAuthRequest('/api/auth/me', 'GET', '/api', 'http://localhost:4200/')).toBe('protected');
  });
});

describe('prepared session request options', () => {
  it.each(['login', 'refresh', 'logout'])('sends exact CSRF and credentials, with no Bearer or refresh JSON, for %s', path => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(HttpClient).post(`/api/auth/${path}`, {}, AUTH_SESSION_OPTIONS).subscribe();
    const request = http.expectOne(`/api/auth/${path}`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-CSRF-Protection')).toBe('1');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    expect(request.request.body).toEqual({});
    request.flush(path === 'logout' ? null : {}, { status: path === 'logout' ? 204 : 200, statusText: 'OK' });
    http.verify();
  });
});
