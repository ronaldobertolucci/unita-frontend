import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { IndividualEmployersComponent } from './individual-employers.component';
import { EmployerService } from '../../../core/services/employer.service';
import { IndividualEmployerDto } from '../../../core/models/legal-entity.model';

const mockEmployer: IndividualEmployerDto = { id: 1, cpf: '12345678901', name: 'João da Silva' };
const mockEmployer2: IndividualEmployerDto = { id: 2, cpf: '98765432100', name: 'Maria Santos' };

function buildService(employers: IndividualEmployerDto[] = []) {
  return {
    individualEmployers: signal(employers),
    loadIndividualEmployers: jest.fn().mockReturnValue(of(employers)),
    createIndividual: jest.fn(),
    updateIndividual: jest.fn(),
    deleteIndividual: jest.fn(),
  };
}

describe('IndividualEmployersComponent', () => {
  let fixture: ComponentFixture<IndividualEmployersComponent>;
  let component: IndividualEmployersComponent;
  let serviceSpy: ReturnType<typeof buildService>;

  function setup(employers: IndividualEmployerDto[] = []) {
    serviceSpy = buildService(employers);

    TestBed.configureTestingModule({
      imports: [IndividualEmployersComponent],
      providers: [{ provide: EmployerService, useValue: serviceSpy }],
    });

    fixture = TestBed.createComponent(IndividualEmployersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadIndividualEmployers on init', () => {
      expect(serviceSpy.loadIndividualEmployers).toHaveBeenCalled();
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
      component.form.patchValue({ name: 'Teste' });
      component.openCreateModal();
      expect(component.errorMessage()).toBeNull();
      expect(component.nameControl.value).toBeFalsy();
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

    it('should prefill form with employer data', () => {
      component.openEditModal(mockEmployer);
      expect(component.cpfControl.value).toBe('12345678901');
      expect(component.nameControl.value).toBe('João da Silva');
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
      expect(serviceSpy.createIndividual).not.toHaveBeenCalled();
      expect(component.cpfControl.touched).toBe(true);
    });

    it('should call createIndividual with correct payload', () => {
      serviceSpy.createIndividual.mockReturnValue(of(mockEmployer));
      component.openCreateModal();
      component.form.setValue({ cpf: '12345678901', name: 'João da Silva' });
      component.save();
      expect(serviceSpy.createIndividual).toHaveBeenCalledWith({
        cpf: '12345678901',
        name: 'João da Silva',
      });
    });

    it('should close modal on success', () => {
      serviceSpy.createIndividual.mockReturnValue(of(mockEmployer));
      component.openCreateModal();
      component.form.setValue({ cpf: '12345678901', name: 'João da Silva' });
      component.save();
      expect(component.activeModal()).toBeNull();
    });

    it('should set translated errorMessage on CPF duplicate', () => {
      serviceSpy.createIndividual.mockReturnValue(
        throwError(() => ({ error: { message: 'An employer with this CPF already exists' } }))
      );
      component.openCreateModal();
      component.form.setValue({ cpf: '12345678901', name: 'João da Silva' });
      component.save();
      expect(component.errorMessage()).toBe('Já existe um empregador cadastrado com este CPF.');
      expect(component.isSaving()).toBe(false);
    });

    it('should set errorMessage on generic failure', () => {
      serviceSpy.createIndividual.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro interno' } }))
      );
      component.openCreateModal();
      component.form.setValue({ cpf: '12345678901', name: 'João da Silva' });
      component.save();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── save() — editar ──────────────────────────────────────────────────────

  describe('save() — edit', () => {
    beforeEach(() => setup([mockEmployer]));

    it('should call updateIndividual with employer id', () => {
      serviceSpy.updateIndividual.mockReturnValue(of({ ...mockEmployer, name: 'João Atualizado' }));
      component.openEditModal(mockEmployer);
      component.form.setValue({ cpf: '12345678901', name: 'João Atualizado' });
      component.save();
      expect(serviceSpy.updateIndividual).toHaveBeenCalledWith(1, {
        cpf: '12345678901',
        name: 'João Atualizado',
      });
    });

    it('should close modal on success', () => {
      serviceSpy.updateIndividual.mockReturnValue(of(mockEmployer));
      component.openEditModal(mockEmployer);
      component.form.setValue({ cpf: '12345678901', name: 'João da Silva' });
      component.save();
      expect(component.activeModal()).toBeNull();
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    beforeEach(() => setup([mockEmployer, mockEmployer2]));

    it('should call deleteIndividual with employer id', () => {
      serviceSpy.deleteIndividual.mockReturnValue(of(undefined));
      component.openDeleteModal(mockEmployer);
      component.delete();
      expect(serviceSpy.deleteIndividual).toHaveBeenCalledWith(1);
    });

    it('should close modal on success', () => {
      serviceSpy.deleteIndividual.mockReturnValue(of(undefined));
      component.openDeleteModal(mockEmployer);
      component.delete();
      expect(component.activeModal()).toBeNull();
    });

    it('should set translated errorMessage when employer is in use', () => {
      serviceSpy.deleteIndividual.mockReturnValue(
        throwError(() => ({ error: { message: 'Employer is in use and cannot be deleted' } }))
      );
      component.openDeleteModal(mockEmployer);
      component.delete();
      expect(component.errorMessage()).toBe('Este empregador está em uso e não pode ser excluído.');
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── formatCpf() ──────────────────────────────────────────────────────────

  describe('formatCpf()', () => {
    beforeEach(() => setup());

    it('should format cpf with mask', () => {
      expect(component.formatCpf('12345678901')).toBe('123.456.789-01');
    });
  });
});