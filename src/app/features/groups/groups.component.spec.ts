import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GroupsComponent } from './groups.component';
import { GroupService } from '../../core/services/group.service';
import { GroupDto } from '../../core/models/group.model';

const mockUser = {
  id: 1, firstName: 'João', lastName: 'Silva',
  email: 'joao@email.com', dateOfBirth: '1990-01-01',
};

const mockGroup: GroupDto = { id: 10, name: 'Família', responsibleUser: mockUser };

function buildGroupService(groups: GroupDto[] = []) {
  return {
    myGroups: signal(groups),
    loading: signal(false),
    loadMyGroups: jest.fn(),
    createGroup: jest.fn(),
  };
}

describe('GroupsComponent', () => {
  let fixture: ComponentFixture<GroupsComponent>;
  let component: GroupsComponent;
  let groupServiceSpy: ReturnType<typeof buildGroupService>;
  let router: Router;

  function setup(groups: GroupDto[] = []) {
    groupServiceSpy = buildGroupService(groups);

    TestBed.configureTestingModule({
      imports: [GroupsComponent, RouterTestingModule],
      providers: [{ provide: GroupService, useValue: groupServiceSpy }],
    });

    fixture = TestBed.createComponent(GroupsComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadMyGroups on init', () => {
      expect(groupServiceSpy.loadMyGroups).toHaveBeenCalled();
    });

    it('should start with modal closed', () => {
      expect(component.modalOpen()).toBe(false);
    });
  });

  describe('openModal() / closeModal()', () => {
    beforeEach(() => setup());

    it('should open modal', () => {
      component.openModal();
      expect(component.modalOpen()).toBe(true);
    });

    it('should close modal', () => {
      component.openModal();
      component.closeModal();
      expect(component.modalOpen()).toBe(false);
    });

    it('should reset form and error when opening', () => {
      component.errorMessage.set('algum erro');
      component.createForm.setValue({ name: 'teste' });
      component.openModal();
      expect(component.errorMessage()).toBeNull();
      expect(component.nameControl.value).toBeFalsy();
    });
  });

  describe('onCreateGroup()', () => {
    beforeEach(() => setup());

    it('should not submit when form is empty', () => {
      component.onCreateGroup();
      expect(groupServiceSpy.createGroup).not.toHaveBeenCalled();
      expect(component.nameControl.touched).toBe(true);
    });

    it('should call createGroup with correct name', () => {
      groupServiceSpy.createGroup.mockReturnValue(of(mockGroup));
      jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.openModal();
      component.createForm.setValue({ name: 'Família' });
      component.onCreateGroup();

      expect(groupServiceSpy.createGroup).toHaveBeenCalledWith({ name: 'Família' });
    });

    it('should navigate to /groups/:id on success', () => {
      groupServiceSpy.createGroup.mockReturnValue(of(mockGroup));
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.createForm.setValue({ name: 'Família' });
      component.onCreateGroup();

      expect(navigateSpy).toHaveBeenCalledWith(['/groups', 10]);
    });

    it('should set errorMessage on failure', () => {
      groupServiceSpy.createGroup.mockReturnValue(
        throwError(() => ({ error: { message: 'Nome já utilizado' } }))
      );

      component.createForm.setValue({ name: 'Família' });
      component.onCreateGroup();

      expect(component.errorMessage()).toBe('Nome já utilizado');
      expect(component.isSaving()).toBe(false);
    });
  });

  describe('getInitials()', () => {
    beforeEach(() => setup());

    it('should return initials from group name', () => {
      expect(component.getInitials('Família Silva')).toBe('FS');
    });

    it('should return single letter for single-word names', () => {
      expect(component.getInitials('Família')).toBe('F');
    });
  });
});