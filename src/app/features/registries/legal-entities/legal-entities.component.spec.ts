import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { LegalEntitiesComponent } from './legal-entities.component';
import { LegalEntityService } from '../../../core/services/legal-entity.service';
import { LegalEntityDto } from '../../../core/models/legal-entity.model';

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

function buildService(entities: LegalEntityDto[] = []) {
  return {
    legalEntities: signal(entities),
    loadLegalEntities: jest.fn().mockReturnValue(of(entities)),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

describe('LegalEntitiesComponent', () => {
  let fixture: ComponentFixture<LegalEntitiesComponent>;
  let component: LegalEntitiesComponent;
  let serviceSpy: ReturnType<typeof buildService>;

  function setup(entities: LegalEntityDto[] = []) {
    serviceSpy = buildService(entities);

    TestBed.configureTestingModule({
      imports: [LegalEntitiesComponent],
      providers: [{ provide: LegalEntityService, useValue: serviceSpy }],
    });

    fixture = TestBed.createComponent(LegalEntitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadLegalEntities on init', () => {
      expect(serviceSpy.loadLegalEntities).toHaveBeenCalled();
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

    it('should reset form and clear error', () => {
      component.errorMessage.set('algum erro');
      component.form.patchValue({ corporateName: 'Teste' });
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
      expect(component.corporateNameControl.value).toBeFalsy();
    });

    it('should clear selected entity', () => {
      component.selectedEntity.set(mockEntity);
      component.openCreateModal();
      expect(component.selectedEntity()).toBeNull();
    });
  });

  // ─── openEditModal() ──────────────────────────────────────────────────────

  describe('openEditModal()', () => {
    beforeEach(() => setup([mockEntity]));

    it('should open edit modal', () => {
      component.openEditModal(mockEntity);
      expect(component.activeModal()).toBe('edit');
    });

    it('should set selected entity', () => {
      component.openEditModal(mockEntity);
      expect(component.selectedEntity()).toEqual(mockEntity);
    });

    it('should prefill form with entity data', () => {
      component.openEditModal(mockEntity);
      expect(component.cnpjControl.value).toBe('12345678000195');
      expect(component.corporateNameControl.value).toBe('Empresa Exemplo S.A.');
      expect(component.tradeNameControl.value).toBe('Empresa Exemplo');
    });
  });

  // ─── openDeleteModal() ────────────────────────────────────────────────────

  describe('openDeleteModal()', () => {
    beforeEach(() => setup([mockEntity]));

    it('should open confirm-delete modal', () => {
      component.openDeleteModal(mockEntity);
      expect(component.activeModal()).toBe('confirm-delete');
    });

    it('should set selected entity', () => {
      component.openDeleteModal(mockEntity);
      expect(component.selectedEntity()).toEqual(mockEntity);
    });
  });

  // ─── closeModal() ─────────────────────────────────────────────────────────

  describe('closeModal()', () => {
    beforeEach(() => setup([mockEntity]));

    it('should close modal and clear state', () => {
      component.openEditModal(mockEntity);
      component.closeModal();
      expect(component.activeModal()).toBeNull();
      expect(component.selectedEntity()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });
  });

  // ─── save() — criar ───────────────────────────────────────────────────────

  describe('save() — create', () => {
    beforeEach(() => setup());

    it('should not submit when form is invalid', () => {
      component.openCreateModal();
      component.save();
      expect(serviceSpy.create).not.toHaveBeenCalled();
      expect(component.cnpjControl.touched).toBe(true);
    });

    it('should call create with correct payload', () => {
      serviceSpy.create.mockReturnValue(of(mockEntity));
      component.openCreateModal();
      component.form.setValue({
        cnpj: '12345678000195',
        corporateName: 'Empresa Exemplo S.A.',
        tradeName: 'Empresa Exemplo',
        stateRegistration: '',
      });
      component.save();
      expect(serviceSpy.create).toHaveBeenCalledWith(
        expect.objectContaining({ cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.' })
      );
    });

    it('should close modal on success', () => {
      serviceSpy.create.mockReturnValue(of(mockEntity));
      component.openCreateModal();
      component.form.setValue({
        cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.',
        tradeName: '', stateRegistration: '',
      });
      component.save();
      expect(component.activeModal()).toBeNull();
    });

    it('should not include empty tradeName in payload', () => {
      serviceSpy.create.mockReturnValue(of(mockEntity));
      component.openCreateModal();
      component.form.setValue({
        cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.',
        tradeName: '', stateRegistration: '',
      });
      component.save();
      const payload = serviceSpy.create.mock.calls[0][0];
      expect(payload.tradeName).toBeUndefined();
    });

    it('should set errorMessage on failure', () => {
      serviceSpy.create.mockReturnValue(
        throwError(() => ({ error: { message: 'A legal entity with this CNPJ already exists' } }))
      );
      component.openCreateModal();
      component.form.setValue({
        cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.',
        tradeName: '', stateRegistration: '',
      });
      component.save();
      expect(component.errorMessage()).toBe('Já existe uma empresa cadastrada com este CNPJ.');
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── save() — editar ──────────────────────────────────────────────────────

  describe('save() — edit', () => {
    beforeEach(() => setup([mockEntity]));

    it('should call update with entity id', () => {
      serviceSpy.update.mockReturnValue(of({ ...mockEntity, corporateName: 'Atualizada' }));
      component.openEditModal(mockEntity);
      component.form.setValue({
        cnpj: '12345678000195', corporateName: 'Atualizada',
        tradeName: '', stateRegistration: '',
      });
      component.save();
      expect(serviceSpy.update).toHaveBeenCalledWith(1, expect.objectContaining({ corporateName: 'Atualizada' }));
    });

    it('should close modal on success', () => {
      serviceSpy.update.mockReturnValue(of(mockEntity));
      component.openEditModal(mockEntity);
      component.form.setValue({
        cnpj: '12345678000195', corporateName: 'Empresa Exemplo S.A.',
        tradeName: '', stateRegistration: '',
      });
      component.save();
      expect(component.activeModal()).toBeNull();
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    beforeEach(() => setup([mockEntity, mockEntity2]));

    it('should call delete with entity id', () => {
      serviceSpy.delete.mockReturnValue(of(undefined));
      component.openDeleteModal(mockEntity);
      component.delete();
      expect(serviceSpy.delete).toHaveBeenCalledWith(1);
    });

    it('should close modal on success', () => {
      serviceSpy.delete.mockReturnValue(of(undefined));
      component.openDeleteModal(mockEntity);
      component.delete();
      expect(component.activeModal()).toBeNull();
    });

    it('should set translated errorMessage on failure', () => {
      serviceSpy.delete.mockReturnValue(
        throwError(() => ({ error: { message: 'Legal entity is in use and cannot be deleted' } }))
      );
      component.openDeleteModal(mockEntity);
      component.delete();
      expect(component.errorMessage()).toBe('Esta empresa está em uso e não pode ser excluída.');
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── formatCnpj() ─────────────────────────────────────────────────────────

  describe('formatCnpj()', () => {
    beforeEach(() => setup());

    it('should format cnpj with mask', () => {
      expect(component.formatCnpj('12345678000195')).toBe('12.345.678/0001-95');
    });
  });
});