import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmployerService } from './employer.service';
import { IndividualEmployerDto, LegalEntityEmployerDto } from '../models/legal-entity.model';
import { environment } from '../../../environments/environment';

const mockIndividual: IndividualEmployerDto = { id: 1, cpf: '12345678901', name: 'João da Silva' };
const mockIndividual2: IndividualEmployerDto = { id: 2, cpf: '98765432100', name: 'Maria Santos' };

const mockLegalEntityEmployer: LegalEntityEmployerDto = {
  id: 1,
  legalEntity: { id: 1, cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.', tradeName: null, stateRegistration: null },
};
const mockLegalEntityEmployer2: LegalEntityEmployerDto = {
  id: 2,
  legalEntity: { id: 2, cnpj: '98765432000100', corporateName: 'Outra Empresa Ltda', tradeName: null, stateRegistration: null },
};

const base = environment.apiUrl;

describe('EmployerService', () => {
  let service: EmployerService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EmployerService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EmployerService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ─── Estado inicial ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with empty individual employers', () => {
      expect(service.individualEmployers()).toEqual([]);
    });

    it('should start with empty legal entity employers', () => {
      expect(service.legalEntityEmployers()).toEqual([]);
    });
  });

  // ─── Empregador PF ─────────────────────────────────────────────────────────

  describe('loadIndividualEmployers()', () => {
    it('should load and set individual employers signal', () => {
      service.loadIndividualEmployers().subscribe();
      http.expectOne(`${base}/employers/individual`).flush([mockIndividual, mockIndividual2]);
      expect(service.individualEmployers()).toEqual([mockIndividual, mockIndividual2]);
    });
  });

  describe('createIndividual()', () => {
    it('should POST and add created employer to signal', () => {
      service.createIndividual({ cpf: '12345678901', name: 'João da Silva' }).subscribe();
      http.expectOne(`${base}/employers/individual`).flush(mockIndividual);
      expect(service.individualEmployers()).toContainEqual(mockIndividual);
    });
  });

  describe('updateIndividual()', () => {
    it('should PATCH and replace employer in signal', () => {
      service['_individualEmployers'].set([mockIndividual, mockIndividual2]);
      const updated = { ...mockIndividual, name: 'João Atualizado' };

      service.updateIndividual(1, { cpf: '12345678901', name: 'João Atualizado' }).subscribe();
      http.expectOne(`${base}/employers/individual/1`).flush(updated);

      expect(service.individualEmployers().find(e => e.id === 1)?.name).toBe('João Atualizado');
      expect(service.individualEmployers().length).toBe(2);
    });
  });

  describe('deleteIndividual()', () => {
    it('should DELETE and remove employer from signal', () => {
      service['_individualEmployers'].set([mockIndividual, mockIndividual2]);

      service.deleteIndividual(1).subscribe();
      http.expectOne(`${base}/employers/individual/1`).flush(null);

      expect(service.individualEmployers().find(e => e.id === 1)).toBeUndefined();
      expect(service.individualEmployers().length).toBe(1);
    });
  });

  // ─── Empregador PJ ─────────────────────────────────────────────────────────

  describe('loadLegalEntityEmployers()', () => {
    it('should load and set legal entity employers signal', () => {
      service.loadLegalEntityEmployers().subscribe();
      http.expectOne(`${base}/employers/legal-entity`).flush([mockLegalEntityEmployer, mockLegalEntityEmployer2]);
      expect(service.legalEntityEmployers()).toEqual([mockLegalEntityEmployer, mockLegalEntityEmployer2]);
    });
  });

  describe('createLegalEntity()', () => {
    it('should POST and add created employer to signal', () => {
      service.createLegalEntity({ legalEntityId: 1 }).subscribe();
      http.expectOne(`${base}/employers/legal-entity`).flush(mockLegalEntityEmployer);
      expect(service.legalEntityEmployers()).toContainEqual(mockLegalEntityEmployer);
    });
  });

  describe('updateLegalEntity()', () => {
    it('should PATCH and replace employer in signal', () => {
      service['_legalEntityEmployers'].set([mockLegalEntityEmployer, mockLegalEntityEmployer2]);
      const updated = { ...mockLegalEntityEmployer, legalEntity: { ...mockLegalEntityEmployer.legalEntity, corporateName: 'Empresa Atualizada' } };

      service.updateLegalEntity(1, { legalEntityId: 1 }).subscribe();
      http.expectOne(`${base}/employers/legal-entity/1`).flush(updated);

      expect(service.legalEntityEmployers().find(e => e.id === 1)?.legalEntity.corporateName).toBe('Empresa Atualizada');
      expect(service.legalEntityEmployers().length).toBe(2);
    });
  });

  describe('deleteLegalEntity()', () => {
    it('should DELETE and remove employer from signal', () => {
      service['_legalEntityEmployers'].set([mockLegalEntityEmployer, mockLegalEntityEmployer2]);

      service.deleteLegalEntity(1).subscribe();
      http.expectOne(`${base}/employers/legal-entity/1`).flush(null);

      expect(service.legalEntityEmployers().find(e => e.id === 1)).toBeUndefined();
      expect(service.legalEntityEmployers().length).toBe(1);
    });
  });
});