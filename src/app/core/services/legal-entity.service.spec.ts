import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LegalEntityService } from './legal-entity.service';
import { LegalEntityDto } from '../models/legal-entity.model';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';
import { syntheticSession } from '../testing/session.mock';

const mockEntity: LegalEntityDto = {
  id: 1,
  cnpj: '12345678000195',
  corporateName: 'Empresa Exemplo S.A.',
  tradeName: 'Empresa Exemplo',
  stateRegistration: null,
};

const mockEntity2: LegalEntityDto = {
  id: 2,
  cnpj: '98765432000100',
  corporateName: 'Outra Empresa Ltda',
  tradeName: null,
  stateRegistration: null,
};

const base = environment.apiUrl;

describe('LegalEntityService', () => {
  let service: LegalEntityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LegalEntityService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LegalEntityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty legal entities', () => {
      expect(service.legalEntities()).toEqual([]);
    });
  });

  // ─── loadLegalEntities() ───────────────────────────────────────────────────

  describe('loadLegalEntities()', () => {
    it('should load and set legal entities signal', () => {
      service.loadLegalEntities().subscribe();
      http.expectOne(`${base}/legal-entities`).flush([mockEntity, mockEntity2]);
      expect(service.legalEntities()).toEqual([mockEntity, mockEntity2]);
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should POST and add created entity to signal', () => {
      service.create({ cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.' }).subscribe();
      http.expectOne(`${base}/legal-entities`).flush(mockEntity);
      expect(service.legalEntities()).toContainEqual(mockEntity);
    });

    it('should append to existing list', () => {
      service['_legalEntities'].set([mockEntity]);
      service.create({ cnpj: '98765432000100', corporateName: 'Outra Empresa Ltda' }).subscribe();
      http.expectOne(`${base}/legal-entities`).flush(mockEntity2);
      expect(service.legalEntities().length).toBe(2);
      expect(service.legalEntities()).toContainEqual(mockEntity2);
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should PATCH and replace entity in signal', () => {
      service['_legalEntities'].set([mockEntity, mockEntity2]);
      const updated = { ...mockEntity, corporateName: 'Empresa Atualizada S.A.' };

      service.update(1, { cnpj: '12345678000195', corporateName: 'Empresa Atualizada S.A.' }).subscribe();
      http.expectOne(`${base}/legal-entities/1`).flush(updated);

      expect(service.legalEntities().find(e => e.id === 1)?.corporateName).toBe('Empresa Atualizada S.A.');
      expect(service.legalEntities().length).toBe(2);
    });

    it('should not affect other entities in signal', () => {
      service['_legalEntities'].set([mockEntity, mockEntity2]);
      const updated = { ...mockEntity, tradeName: 'Novo Fantasia' };

      service.update(1, { cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.', tradeName: 'Novo Fantasia' }).subscribe();
      http.expectOne(`${base}/legal-entities/1`).flush(updated);

      expect(service.legalEntities().find(e => e.id === 2)).toEqual(mockEntity2);
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should DELETE and remove entity from signal', () => {
      service['_legalEntities'].set([mockEntity, mockEntity2]);

      service.delete(1).subscribe();
      http.expectOne(`${base}/legal-entities/1`).flush(null);

      expect(service.legalEntities().find(e => e.id === 1)).toBeUndefined();
      expect(service.legalEntities().length).toBe(1);
    });

    it('should not remove other entities', () => {
      service['_legalEntities'].set([mockEntity, mockEntity2]);

      service.delete(1).subscribe();
      http.expectOne(`${base}/legal-entities/1`).flush(null);

      expect(service.legalEntities()).toContainEqual(mockEntity2);
    });
  });

  describe('INV-003 private institution contract', () => {
    const alphanumeric = { ...mockEntity, cnpj: '00000000E08G12' };

    it.each(['12345678000195', '00000000E08G12', '00.000.000/e08g-12'])(
      'POST preserves canonical CNPJ text for %s without changing the input', cnpj => {
        const payload = Object.freeze({ cnpj, corporateName: mockEntity.corporateName });
        service.create(payload).subscribe();
        const request = http.expectOne(`${base}/legal-entities`);
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ cnpj: cnpj.replace(/[./-]/g, '').toUpperCase(), corporateName: mockEntity.corporateName });
        expect(request.request.headers.has('Idempotency-Key')).toBe(false);
        request.flush({ ...mockEntity, cnpj: request.request.body.cnpj }, { status: 201, statusText: 'Created' });
        expect(service.legalEntities()[0].cnpj).toBe(request.request.body.cnpj);
        expect(payload.cnpj).toBe(cnpj);
      }
    );

    it('PATCH sends required fields, preserves numeric ID and omits cleared optional fields', () => {
      service['_legalEntities'].set([mockEntity]);
      service.update(1, { cnpj: '00.000.000/e08g-12', corporateName: mockEntity.corporateName }).subscribe();
      const request = http.expectOne(`${base}/legal-entities/1`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ cnpj: '00000000E08G12', corporateName: mockEntity.corporateName });
      request.flush({ ...alphanumeric, tradeName: null });
      expect(service.legalEntities()).toEqual([{ ...alphanumeric, tradeName: null }]);
    });

    it('preserves original historical CNPJ when reading', () => {
      const historical = { ...mockEntity, cnpj: 'original inválido' };
      service.loadLegalEntities().subscribe();
      const request = http.expectOne(`${base}/legal-entities`);
      expect(request.request.method).toBe('GET');
      request.flush([historical]);
      expect(service.legalEntities()).toEqual([historical]);
    });

    it.each([400, 404, 409])('propagates an institution error (%s) without changing the list or retrying', status => {
      service['_legalEntities'].set([alphanumeric]);
      const error = jest.fn();
      if (status === 400) service.create({ cnpj: alphanumeric.cnpj, corporateName: mockEntity.corporateName }).subscribe({ error });
      else service.delete(1).subscribe({ error });
      http.expectOne(status === 400 ? `${base}/legal-entities` : `${base}/legal-entities/1`)
        .flush({ message: 'Registration conflict' }, { status, statusText: 'Error' });
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ status }));
      expect(service.legalEntities()).toEqual([alphanumeric]);
      http.expectNone(request => true);
    });

    it('does not retry an uncertain creation or present it as confirmed', () => {
      const error = jest.fn();
      service.create({ cnpj: alphanumeric.cnpj, corporateName: mockEntity.corporateName }).subscribe({ error });
      http.expectOne(`${base}/legal-entities`).error(new ProgressEvent('error'));
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }));
      expect(service.legalEntities()).toEqual([]);
      http.expectNone(request => true);
    });

    it('allows two sessions to register the same CNPJ without sending an owner in the body', () => {
      const session = TestBed.inject(SessionService);
      for (const id of [1, 2]) {
        session.invalidate('login', 'unknown');
        session.accept(syntheticSession(id), session.version());
        expect(service.legalEntities()).toEqual([]);
        service.create({ cnpj: alphanumeric.cnpj, corporateName: mockEntity.corporateName }).subscribe();
        const request = http.expectOne(`${base}/legal-entities`);
        expect(request.request.body).toEqual({ cnpj: '00000000E08G12', corporateName: mockEntity.corporateName });
        request.flush({ ...alphanumeric, id });
        expect(service.legalEntities()).toEqual([{ ...alphanumeric, id }]);
      }
    });

    const requests: [string, (service: LegalEntityService) => import('rxjs').Observable<unknown>][] = [
      ['list', service => service.loadLegalEntities()],
      ['create', service => service.create({ cnpj: alphanumeric.cnpj, corporateName: mockEntity.corporateName })],
      ['update', service => service.update(1, { cnpj: alphanumeric.cnpj, corporateName: mockEntity.corporateName })],
      ['delete', service => service.delete(1)],
    ];

    it.each(requests)('cancels %s on account change and clears cached institutions', (_name, send) => {
      const session = TestBed.inject(SessionService);
      session.accept(syntheticSession(), session.version());
      service['_legalEntities'].set([alphanumeric]);
      const received = jest.fn();
      send(service).subscribe(received);
      const pending = http.expectOne(request => request.url.startsWith(`${base}/legal-entities`));
      session.invalidate('login', 'unknown');
      session.accept(syntheticSession(2), session.version());
      expect(pending.cancelled).toBe(true);
      expect(received).not.toHaveBeenCalled();
      expect(service.legalEntities()).toEqual([]);
      http.expectNone(request => true);
    });

    it.each(requests)('never starts a %s captured in another session', (_name, send) => {
      const session = TestBed.inject(SessionService);
      session.accept(syntheticSession(), session.version());
      const captured = send(service);
      session.invalidate('login', 'unknown');
      session.accept(syntheticSession(2), session.version());
      captured.subscribe();
      expect(service.legalEntities()).toEqual([]);
      http.expectNone(request => true);
    });
  });
});
