import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LegalEntityService } from './legal-entity.service';
import { LegalEntityDto } from '../models/legal-entity.model';
import { environment } from '../../../environments/environment';

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
});