import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { LegalEntityEmployersComponent } from './legal-entity-employers.component';
import { EmployerService } from '../../../core/services/employer.service';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { LegalEntityEmployerDto, LegalEntityDto } from '../../../core/models/legal-entity.model';

const mockLegalEntity: LegalEntityDto = {
  id: 1, cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.',
  tradeName: null, stateRegistration: null,
};

const mockLegalEntity2: LegalEntityDto = {
  id: 2, cnpj: '98765432000100', corporateName: 'Outra Empresa Ltda',
  tradeName: null, stateRegistration: null,
};

const mockEmployer: LegalEntityEmployerDto = { id: 1, legalEntity: mockLegalEntity };
const mockEmployer2: LegalEntityEmployerDto = { id: 2, legalEntity: mockLegalEntity2 };

function buildEmployerService(employers: LegalEntityEmployerDto[] = []) {
  return {
    legalEntityEmployers: signal(employers),
    loadLegalEntityEmployers: jest.fn().mockReturnValue(of(employers)),
    createLegalEntity: jest.fn(),
    updateLegalEntity: jest.fn(),
    deleteLegalEntity: jest.fn(),
  };
}

function buildLegalEntityService(entities: LegalEntityDto[] = []) {
  return {
    legalEntities: signal(entities),
    loadLegalEntities: jest.fn().mockReturnValue(of(entities)),
  };
}

describe('LegalEntityEmployersComponent', () => {
  let fixture: ComponentFixture<LegalEntityEmployersComponent>;
  let component: LegalEntityEmployersComponent;
  let employerServiceSpy: ReturnType<typeof buildEmployerService>;
  let legalEntityServiceSpy: ReturnType<typeof buildLegalEntityService>;

  function setup(
    employers: LegalEntityEmployerDto[] = [],
    entities: LegalEntityDto[] = [mockLegalEntity, mockLegalEntity2]
  ) {
    employerServiceSpy = buildEmployerService(employers);
    legalEntityServiceSpy = buildLegalEntityService(entities);

    TestBed.configureTestingModule({
      imports: [LegalEntityEmployersComponent],
      providers: [
        { provide: EmployerService, useValue: employerServiceSpy },
        { provide: LegalEntityService, useValue: legalEntityServiceSpy },
      ],
    });

    fixture = TestBed.createComponent(LegalEntityEmployersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadLegalEntityEmployers on init', () => {
      expect(employerServiceSpy.loadLegalEntityEmployers).toHaveBeenCalled();
    });

    it('should start with no active modal', () => {
      expect(component.activeModal()).toBeNull();
    });

    it('should start with isLoading false after init', () => {
      expect(component.isLoading()).toBe(false);
    });
  });

  // ─── openCreateModal() ────────────────────────────────────────────────────

  describe('openCreateModal()', () => {
    beforeEach(() => setup());

    it('should open create modal', () => {
      component.openCreateModal();
      expect(component.activeModal()).toBe('create');
    });

    it('should load legal entities', () => {
      component.openCreateModal();
      expect(legalEntityServiceSpy.loadLegalEntities).toHaveBeenCalled();
    });

    it('should not reload legal entities if already loaded', () => {
      component.legalEntities.set([mockLegalEntity]);
      component.openCreateModal();
      expect(legalEntityServiceSpy.loadLegalEntities).not.toHaveBeenCalled();
    });

    it('should reset form and clear error', () => {
      component.errorMessage.set('algum erro');
      component.form.patchValue({ legalEntityId: 1 });
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
      expect(component.legalEntityIdControl.value).toBeNull();
    });

    it('should clear selected employer', () => {
      component.selectedEmployer.set(mockEmployer);
      component.openCreateModal();
      expect(component.selectedEmployer()).toBeNull();
    });
  });

  // ─── openEditModal() ──────────────────────────────────────────────────────

  describe('openEditModal()', () => {
    beforeEach(() => setup([mockEmployer]));

    it('should open edit modal', () => {
      component.openEditModal(mockEmployer);
      expect(component.activeModal()).toBe('edit');
    });

    it('should set selected employer', () => {
      component.openEditModal(mockEmployer);
      expect(component.selectedEmployer()).toEqual(mockEmployer);
    });

    it('should prefill form with current legalEntityId', () => {
      component.openEditModal(mockEmployer);
      expect(component.legalEntityIdControl.value).toBe(1);
    });

    it('should load legal entities', () => {
      component.openEditModal(mockEmployer);
      expect(legalEntityServiceSpy.loadLegalEntities).toHaveBeenCalled();
    });
  });

  // ─── openDeleteModal() ────────────────────────────────────────────────────

  describe('openDeleteModal()', () => {
    beforeEach(() => setup([mockEmployer]));

    it('should open confirm-delete modal', () => {
      component.openDeleteModal(mockEmployer);
      expect(component.activeModal()).toBe('confirm-delete');
    });

    it('should set selected employer', () => {
      component.openDeleteModal(mockEmployer);
      expect(component.selectedEmployer()).toEqual(mockEmployer);
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup([mockEmployer]));

    it('should close modal and clear state', () => {
      component.openEditModal(mockEmployer);
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedEmployer()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── save() — criar ───────────────────────────────────────────────────────

  describe('save() — create', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openCreateModal();
      component.save();
      expect(employerServiceSpy.createLegalEntity).not.toHaveBeenCalled();
      expect(component.legalEntityIdControl.touched).toBe(true);
    });

    it('should call createLegalEntity with correct payload', () => {
      employerServiceSpy.createLegalEntity.mockReturnValue(of(mockEmployer));
      component.openCreateModal();
      component.form.setValue({ legalEntityId: 1 });
      component.save();
      expect(employerServiceSpy.createLegalEntity).toHaveBeenCalledWith({ legalEntityId: 1 });
    });

    it('should close modal on success', () => {
      employerServiceSpy.createLegalEntity.mockReturnValue(of(mockEmployer));
      component.openCreateModal();
      component.form.setValue({ legalEntityId: 1 });
      component.save();
      expect(component.activeModal()).toBeNull();
    });

    it('should set translated errorMessage when employer already exists for entity', () => {
      employerServiceSpy.createLegalEntity.mockReturnValue(
        throwError(() => ({ error: { message: 'An employer for this legal entity already exists' } }))
      );
      component.openCreateModal();
      component.form.setValue({ legalEntityId: 1 });
      component.save();
      expect(component.errorMessage()).toBe('Já existe um empregador cadastrado para esta empresa.');
      expect(component.isSaving()).toBe(false);
    });

    it('should set errorMessage on generic failure', () => {
      employerServiceSpy.createLegalEntity.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.openCreateModal();
      component.form.setValue({ legalEntityId: 1 });
      component.save();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── save() — editar ──────────────────────────────────────────────────────

  describe('save() — edit', () => {
    beforeEach(() => setup([mockEmployer]));

    it('should call updateLegalEntity with employer id', () => {
      employerServiceSpy.updateLegalEntity.mockReturnValue(of({ ...mockEmployer, legalEntity: mockLegalEntity2 }));
      component.openEditModal(mockEmployer);
      component.form.setValue({ legalEntityId: 2 });
      component.save();
      expect(employerServiceSpy.updateLegalEntity).toHaveBeenCalledWith(1, { legalEntityId: 2 });
    });

    it('should close modal on success', () => {
      employerServiceSpy.updateLegalEntity.mockReturnValue(of(mockEmployer));
      component.openEditModal(mockEmployer);
      component.form.setValue({ legalEntityId: 1 });
      component.save();
      expect(component.activeModal()).toBeNull();
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    beforeEach(() => setup([mockEmployer, mockEmployer2]));

    it('should call deleteLegalEntity with employer id', () => {
      employerServiceSpy.deleteLegalEntity.mockReturnValue(of(undefined));
      component.openDeleteModal(mockEmployer);
      component.delete();
      expect(employerServiceSpy.deleteLegalEntity).toHaveBeenCalledWith(1);
    });

    it('should close modal on success', () => {
      employerServiceSpy.deleteLegalEntity.mockReturnValue(of(undefined));
      component.openDeleteModal(mockEmployer);
      component.delete();
      expect(component.activeModal()).toBeNull();
    });

    it('should set translated errorMessage when employer is in use', () => {
      employerServiceSpy.deleteLegalEntity.mockReturnValue(
        throwError(() => ({ error: { message: 'Employer is in use and cannot be deleted' } }))
      );
      component.openDeleteModal(mockEmployer);
      component.delete();
      expect(component.errorMessage()).toBe('Este empregador está em uso e não pode ser excluído.');
      expect(component.isSaving()).toBe(false);
    });
  });
});