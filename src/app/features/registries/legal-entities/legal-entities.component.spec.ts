import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionService } from '../../../core/services/session.service';
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
      expect(component.errorMessage()).toBe('Já existe uma empresa com este CNPJ nos seus cadastros.');
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

  describe('INV-003 institution form', () => {
    beforeEach(() => setup([{ ...mockEntity, cnpj: '00000000E08G12' }]));

    it('renders the alphanumeric mask with the existing entity list', () => {
      expect(fixture.nativeElement.querySelector('.entity-cnpj').textContent).toBe('00.000.000/E08G-12');
    });

    it.each(['12345678000195', '12.345.678/0001-95', '00000000E08G12', '00.000.000/e08g-12'])(
      'accepts typing or pasting %s and sends canonical text', value => {
        serviceSpy.create.mockReturnValue(of(mockEntity));
        component.openCreateModal();
        fixture.detectChanges();
        const input: HTMLInputElement = fixture.nativeElement.querySelector('#cnpj');
        expect(input.type).toBe('text');
        expect(input.hasAttribute('inputmode')).toBe(false);
        expect(input.maxLength).toBe(18);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        component.corporateNameControl.setValue('Minha instituição');
        fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
        expect(serviceSpy.create).toHaveBeenCalledWith(expect.objectContaining({
          cnpj: value.replace(/[./-]/g, '').toUpperCase(),
        }));
      }
    );

    it.each(['00000000E08G1A', '00000000E08G1', '00000000E08G123', '00.000000/E08G-12', '00000000_E08G12'])(
      'blocks invalid CNPJ %s with an accessible format message', value => {
        component.openCreateModal();
        component.form.patchValue({ cnpj: value, corporateName: 'Minha instituição' });
        component.save();
        fixture.detectChanges();
        expect(serviceSpy.create).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('#cnpj').getAttribute('aria-invalid')).toBe('true');
        expect(fixture.nativeElement.querySelector('#cnpj-error').textContent).toContain('12 letras ou números e 2 dígitos finais');
      }
    );

    it('keeps historical invalid CNPJ visible and requires explicit correction on edit', () => {
      const historical = { ...mockEntity, cnpj: 'histórico-inválido' };
      serviceSpy.legalEntities.set([historical]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.entity-cnpj').textContent).toBe(historical.cnpj);
      component.openEditModal(historical);
      component.save();
      expect(component.cnpjControl.value).toBe(historical.cnpj);
      expect(serviceSpy.update).not.toHaveBeenCalled();
      serviceSpy.update.mockReturnValue(of({ ...historical, cnpj: '00000000E08G12' }));
      component.cnpjControl.setValue('00.000.000/e08g-12');
      component.save();
      expect(serviceSpy.update).toHaveBeenCalledWith(historical.id, expect.objectContaining({ cnpj: '00000000E08G12' }));
    });

    it('shows duplicate CNPJ within the user registrations and preserves the draft', () => {
      serviceSpy.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: {
        message: 'A legal entity with this CNPJ already exists in your registrations',
      } })));
      component.openCreateModal();
      component.form.patchValue({ cnpj: '00000000E08G12', corporateName: 'Minha instituição' });
      component.save();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.modal-error').textContent).toContain('nos seus cadastros');
      expect(component.cnpjControl.value).toBe('00000000E08G12');
      expect(component.activeModal()).toBe('create');
    });

    it('associates backend validation with its field and allows correction', () => {
      serviceSpy.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: {
        message: 'Invalid input data', errors: [{ field: 'cnpj', message: 'must contain 12 letters/digits and 2 final digits' }],
      } })));
      component.openEditModal(mockEntity);
      fixture.detectChanges();
      component.save();
      fixture.detectChanges();
      expect(component.cnpjControl.hasError('server')).toBe(true);
      expect(fixture.nativeElement.querySelector('#cnpj-error').textContent).toContain('12 letras ou números');
      component.cnpjControl.setValue('00000000E08G12');
      expect(component.cnpjControl.valid).toBe(true);
    });

    it('keeps a referenced institution after a delete conflict', () => {
      serviceSpy.delete.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: {
        message: 'Legal entity is in use and cannot be deleted',
      } })));
      component.openDeleteModal(mockEntity);
      component.delete();
      expect(component.errorMessage()).toBe('Esta empresa está em uso e não pode ser excluída.');
      expect(component.activeModal()).toBe('confirm-delete');
      expect(component.legalEntities()).toHaveLength(1);
    });

    it('blocks another submission while saving', () => {
      serviceSpy.create.mockReturnValue(new Subject());
      component.openCreateModal();
      component.form.patchValue({ cnpj: '00000000E08G12', corporateName: 'Minha instituição' });
      component.save();
      component.save();
      expect(serviceSpy.create).toHaveBeenCalledTimes(1);
    });

    it.each([0, 408, 500])('requires checking the registration after an uncertain write (%s)', status => {
      serviceSpy.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      component.openCreateModal();
      component.form.patchValue({ cnpj: '00000000E08G12', corporateName: 'Minha instituição' });
      component.save();
      expect(component.errorMessage()).toContain('Não foi possível confirmar se a empresa foi salva');
      expect(component.cnpjControl.value).toBe('00000000E08G12');
      expect(component.activeModal()).toBe('create');
      expect(serviceSpy.create).toHaveBeenCalledTimes(1);

      serviceSpy.delete.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      component.openDeleteModal(mockEntity);
      component.delete();
      expect(component.errorMessage()).toContain('Não foi possível confirmar se a empresa foi excluída');
      expect(component.activeModal()).toBe('confirm-delete');
      expect(component.legalEntities()).toHaveLength(1);
      expect(serviceSpy.delete).toHaveBeenCalledTimes(1);
    });

    it('clears institution drafts and selections on session invalidation', () => {
      component.openEditModal(mockEntity);
      component.errorMessage.set('Mensagem privada');
      TestBed.inject(SessionService).invalidate('logout');
      expect(component.activeModal()).toBeNull();
      expect(component.selectedEntity()).toBeNull();
      expect(component.cnpjControl.value).toBeNull();
      expect(component.corporateNameControl.value).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });

    it('distinguishes a failed list load from an empty list and allows a read retry', () => {
      serviceSpy.loadLegalEntities.mockReturnValue(throwError(() => new Error('offline')));
      component.loadEntities();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.empty-state').textContent).toContain('Empresas indisponíveis');
      serviceSpy.loadLegalEntities.mockReturnValue(of([]));
      fixture.nativeElement.querySelector('.empty-state button').click();
      fixture.detectChanges();
      expect(component.loadErrorMessage()).toBeNull();
      expect(component.isLoading()).toBe(false);
    });
  });
});
