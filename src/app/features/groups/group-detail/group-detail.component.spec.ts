import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GroupDetailComponent } from './group-detail.component';
import { AuthService } from '../../../core/services/auth.service';
import { GroupService } from '../../../core/services/group.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { GroupDto, GroupMembership } from '../../../core/models/group.model';
import { GroupInvitation } from '../../../core/models/invitation.model';

const mockUser = {
  id: 1, firstName: 'João', lastName: 'Silva',
  email: 'joao@email.com', dateOfBirth: '1990-01-01',
};

const mockUser2 = {
  id: 2, firstName: 'Maria', lastName: 'Santos',
  email: 'maria@email.com', dateOfBirth: '1992-05-10',
};

const mockGroup: GroupDto = { id: 10, name: 'Família', responsibleUser: mockUser };

const mockMembership: GroupMembership = {
  id: 1, user: mockUser, group: mockGroup, joinedAt: '2024-01-01T00:00:00',
};

const mockMembership2: GroupMembership = {
  id: 2, user: mockUser2, group: mockGroup, joinedAt: '2024-02-01T00:00:00',
};

const mockInvitation: GroupInvitation = {
  id: 1,
  group: mockGroup,
  invitedUser: mockUser2,
  status: 'PENDING',
};

function buildActivatedRoute(id = '10') {
  return { snapshot: { paramMap: { get: () => id } } };
}

describe('GroupDetailComponent', () => {
  let fixture: ComponentFixture<GroupDetailComponent>;
  let component: GroupDetailComponent;
  let groupServiceSpy: jest.Mocked<Pick<GroupService, 'getGroup' | 'getMembers' | 'updateGroup' | 'transferResponsibility' | 'leaveGroup' | 'deleteGroup'>>;
  let invitationServiceSpy: jest.Mocked<Pick<InvitationService, 'getGroupInvitations' | 'createInvitation' | 'cancelInvitation'>>;
  let router: Router;

  function setup(user = mockUser) {
    groupServiceSpy = {
      getGroup: jest.fn().mockReturnValue(of(mockGroup)),
      getMembers: jest.fn().mockReturnValue(of([mockMembership, mockMembership2])),
      updateGroup: jest.fn(),
      transferResponsibility: jest.fn(),
      leaveGroup: jest.fn(),
      deleteGroup: jest.fn(),
    };

    invitationServiceSpy = {
      getGroupInvitations: jest.fn().mockReturnValue(of([mockInvitation])),
      createInvitation: jest.fn(),
      cancelInvitation: jest.fn(),
    };

    TestBed.configureTestingModule({
      imports: [GroupDetailComponent, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: buildActivatedRoute() },
        { provide: AuthService, useValue: { currentUser: signal(user) } },
        { provide: GroupService, useValue: groupServiceSpy },
        { provide: InvitationService, useValue: invitationServiceSpy },
      ],
    });

    fixture = TestBed.createComponent(GroupDetailComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should load group, members and invitations on init', () => {
      expect(groupServiceSpy.getGroup).toHaveBeenCalledWith(10);
      expect(groupServiceSpy.getMembers).toHaveBeenCalledWith(10);
      expect(invitationServiceSpy.getGroupInvitations).toHaveBeenCalledWith(10);
    });

    it('should set group signal after loading', () => {
      expect(component.group()).toEqual(mockGroup);
    });

    it('should filter only PENDING invitations', () => {
      expect(component.invitations().every(i => i.status === 'PENDING')).toBe(true);
    });

    it('should redirect to /groups on getGroup error', () => {
      groupServiceSpy.getGroup.mockReturnValue(
        throwError(() => ({ status: 404 }))
      );
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture = TestBed.createComponent(GroupDetailComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(['/groups']);
    });
  });

  describe('isResponsible()', () => {
    it('should return true when current user is responsible', () => {
      setup(mockUser);
      expect(component.isResponsible()).toBe(true);
    });

    it('should return false when current user is not responsible', () => {
      setup(mockUser2);
      expect(component.isResponsible()).toBe(false);
    });
  });

  describe('otherMembers()', () => {
    beforeEach(() => setup());

    it('should exclude the current user from the list', () => {
      expect(component.otherMembers().every(m => m.user.id !== mockUser.id)).toBe(true);
    });

    it('should include other members', () => {
      expect(component.otherMembers().length).toBe(1);
      expect(component.otherMembers()[0].user.id).toBe(mockUser2.id);
    });
  });

  describe('openModal() / closeModal()', () => {
    beforeEach(() => setup());

    it('should set the active modal', () => {
      component.openModal('invite');
      expect(component.activeModal()).toBe('invite');
    });

    it('should close the modal', () => {
      component.openModal('invite');
      component.closeModal();
      expect(component.activeModal()).toBeNull();
    });

    it('should prefill editNameForm when opening edit-name modal', () => {
      component.openModal('edit-name');
      expect(component.editNameControl.value).toBe('Família');
    });
  });

  describe('saveGroupName()', () => {
    beforeEach(() => setup());

    it('should not submit when form is empty', () => {
      component.openModal('edit-name');
      component.editNameForm.setValue({ name: '' });
      component.saveGroupName();
      expect(groupServiceSpy.updateGroup).not.toHaveBeenCalled();
    });

    it('should call updateGroup and close modal on success', () => {
      const updated = { ...mockGroup, name: 'Família Nova' };
      groupServiceSpy.updateGroup.mockReturnValue(of(updated));

      component.openModal('edit-name');
      component.editNameForm.setValue({ name: 'Família Nova' });
      component.saveGroupName();

      expect(groupServiceSpy.updateGroup).toHaveBeenCalledWith(10, { name: 'Família Nova' });
      expect(component.group()?.name).toBe('Família Nova');
      expect(component.activeModal()).toBeNull();
    });

    it('should set translated errorMessage on failure', () => {
      groupServiceSpy.updateGroup.mockReturnValue(
        throwError(() => ({ error: { message: 'Group not found' } }))
      );

      component.openModal('edit-name');
      component.editNameForm.setValue({ name: 'Novo Nome' });
      component.saveGroupName();

      expect(component.errorMessage()).toBe('Grupo não encontrado.');
    });
  });

  describe('inviteMember()', () => {
    beforeEach(() => setup());

    it('should not submit when email is invalid', () => {
      component.openModal('invite');
      component.inviteForm.setValue({ email: 'invalid' });
      component.inviteMember();
      expect(invitationServiceSpy.createInvitation).not.toHaveBeenCalled();
    });

    it('should call createInvitation and add to list on success', () => {
      invitationServiceSpy.createInvitation.mockReturnValue(of(mockInvitation));

      component.openModal('invite');
      component.inviteForm.setValue({ email: 'novo@email.com' });
      component.inviteMember();

      expect(invitationServiceSpy.createInvitation).toHaveBeenCalledWith(10, 'novo@email.com');
      expect(component.activeModal()).toBeNull();
    });

    it('should translate User not found error to Portuguese', () => {
      invitationServiceSpy.createInvitation.mockReturnValue(
        throwError(() => ({ error: { message: 'User not found' } }))
      );

      component.openModal('invite');
      component.inviteForm.setValue({ email: 'naoexiste@email.com' });
      component.inviteMember();

      expect(component.errorMessage()).toBe(
        'Usuário não encontrado. Verifique o e-mail informado.'
      );
    });
  });

  describe('cancelInvitation()', () => {
    beforeEach(() => setup());

    it('should call cancelInvitation and remove from list', () => {
      invitationServiceSpy.cancelInvitation.mockReturnValue(of(undefined));
      const initialCount = component.invitations().length;

      component.cancelInvitation(1);

      expect(invitationServiceSpy.cancelInvitation).toHaveBeenCalledWith(1);
      expect(component.invitations().length).toBe(initialCount - 1);
    });
  });

  describe('transferResponsibility()', () => {
    beforeEach(() => setup());

    it('should not call service when no member is selected', () => {
      component.selectedMemberId.set(null);
      component.transferResponsibility();
      expect(groupServiceSpy.transferResponsibility).not.toHaveBeenCalled();
    });

    it('should call transferResponsibility with selected member id', () => {
      const updated = { ...mockGroup, responsibleUser: mockUser2 };
      groupServiceSpy.transferResponsibility.mockReturnValue(of(updated));

      component.openModal('transfer');
      component.selectedMemberId.set(mockUser2.id);
      component.transferResponsibility();

      expect(groupServiceSpy.transferResponsibility).toHaveBeenCalledWith(10, {
        newResponsibleUserId: mockUser2.id,
      });
      expect(component.group()?.responsibleUser.id).toBe(mockUser2.id);
      expect(component.activeModal()).toBeNull();
    });
  });

  describe('leaveGroup()', () => {
    beforeEach(() => setup(mockUser2));

    it('should call leaveGroup and navigate to /groups', () => {
      groupServiceSpy.leaveGroup.mockReturnValue(of(undefined));
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.leaveGroup();

      expect(groupServiceSpy.leaveGroup).toHaveBeenCalledWith(10);
      expect(navigateSpy).toHaveBeenCalledWith(['/groups']);
    });
  });

  describe('deleteGroup()', () => {
    beforeEach(() => setup());

    it('should call deleteGroup and navigate to /groups', () => {
      groupServiceSpy.deleteGroup.mockReturnValue(of(undefined));
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      component.deleteGroup();

      expect(groupServiceSpy.deleteGroup).toHaveBeenCalledWith(10);
      expect(navigateSpy).toHaveBeenCalledWith(['/groups']);
    });
  });

  describe('getInitials()', () => {
    beforeEach(() => setup());

    it('should return initials from full name', () => {
      expect(component.getInitials('João Silva')).toBe('JS');
    });
  });

  describe('setTab()', () => {
    beforeEach(() => setup());

    it('should switch active tab', () => {
      expect(component.activeTab()).toBe('members');
      component.setTab('invitations');
      expect(component.activeTab()).toBe('invitations');
    });
  });
});