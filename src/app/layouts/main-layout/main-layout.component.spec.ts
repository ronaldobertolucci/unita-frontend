import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { signal } from '@angular/core';
import { MainLayoutComponent } from './main-layout.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService, SseInvitationToast } from '../../core/services/notification.service';
import { GroupInvitation } from '../../core/models/invitation.model';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 1,
  firstName: 'João',
  lastName: 'Silva',
  email: 'joao@email.com',
  dateOfBirth: '1990-01-01',
};

const mockInvitation: GroupInvitation = {
  id: 1,
  group: { id: 10, name: 'Família', responsibleUser: mockUser },
  invitedUser: mockUser,
  status: 'PENDING',
};

const mockToast: SseInvitationToast = {
  invitationId: 42,
  groupName: 'Família Silva',
  invitingUserFirstName: 'João',
  invitingUserLastName: 'Silva',
};

// ── Builders ──────────────────────────────────────────────────────────────────

function buildAuthService(user = mockUser) {
  return {
    currentUser:     signal(user),
    isAuthenticated: signal(true),
    logout:          jest.fn(),
  };
}

function buildNotificationService(invitations: GroupInvitation[] = []) {
  const _invitations = signal(invitations);
  return {
    invitations:          _invitations.asReadonly(),
    pendingCount:         signal(invitations.length),
    hasNotifications:     signal(invitations.length > 0),
    loading:              signal(false),
    respondError:         signal(null),
    sseToast:             signal<SseInvitationToast | null>(null),
    loadInvitations:      jest.fn(),
    respondToInvitation:  jest.fn(),
    connectSSE:           jest.fn(),
    disconnectSSE:        jest.fn(),
    dismissToast:         jest.fn(),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MainLayoutComponent', () => {
  let fixture: ComponentFixture<MainLayoutComponent>;
  let component: MainLayoutComponent;
  let authServiceSpy:         ReturnType<typeof buildAuthService>;
  let notificationServiceSpy: ReturnType<typeof buildNotificationService>;

  function setup(invitations: GroupInvitation[] = []) {
    authServiceSpy         = buildAuthService();
    notificationServiceSpy = buildNotificationService(invitations);

    TestBed.configureTestingModule({
      imports: [MainLayoutComponent, RouterTestingModule],
      providers: [
        { provide: AuthService,         useValue: authServiceSpy         },
        { provide: NotificationService, useValue: notificationServiceSpy },
      ],
    });

    fixture   = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call loadInvitations on init', () => {
      expect(notificationServiceSpy.loadInvitations).toHaveBeenCalled();
    });

    it('should call connectSSE on init', () => {
      expect(notificationServiceSpy.connectSSE).toHaveBeenCalled();
    });

    it('should compute userInitials correctly', () => {
      expect(component.userInitials()).toBe('JS');
    });

    it('should expose sseToast from notification service', () => {
      expect(component.sseToast()).toBeNull();
    });
  });

  // ─── ngOnDestroy ──────────────────────────────────────────────────────────

  describe('ngOnDestroy()', () => {
    beforeEach(() => setup());

    it('should call disconnectSSE on destroy', () => {
      fixture.destroy();
      expect(notificationServiceSpy.disconnectSSE).toHaveBeenCalled();
    });
  });

  // ─── userInitials() ───────────────────────────────────────────────────────

  describe('userInitials()', () => {
    it('should return "?" when user is null', () => {
      authServiceSpy = buildAuthService();
      authServiceSpy.currentUser = signal(null as any);
      notificationServiceSpy = buildNotificationService();

      TestBed.configureTestingModule({
        imports: [MainLayoutComponent, RouterTestingModule],
        providers: [
          { provide: AuthService,         useValue: authServiceSpy         },
          { provide: NotificationService, useValue: notificationServiceSpy },
        ],
      });

      fixture   = TestBed.createComponent(MainLayoutComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.userInitials()).toBe('?');
    });
  });

  // ─── toggleNotifications() ────────────────────────────────────────────────

  describe('toggleNotifications()', () => {
    beforeEach(() => setup());

    it('should set notificationSource to the given source', () => {
      expect(component.notificationSource()).toBeNull();
      component.toggleNotifications('sidebar');
      expect(component.notificationSource()).toBe('sidebar');
    });

    it('should close notifications when toggled with the same source', () => {
      component.toggleNotifications('topbar');
      component.toggleNotifications('topbar');
      expect(component.notificationSource()).toBeNull();
    });

    it('should switch source when toggled with a different source', () => {
      component.toggleNotifications('sidebar');
      component.toggleNotifications('topbar');
      expect(component.notificationSource()).toBe('topbar');
    });

    it('should close user menu when opening notifications', () => {
      component.toggleUserMenu('sidebar');
      expect(component.userMenuSource()).toBe('sidebar');
      component.toggleNotifications('sidebar');
      expect(component.userMenuSource()).toBeNull();
    });

    it('should close more menu when opening notifications', () => {
      component.toggleMoreMenu();
      expect(component.moreMenuOpen()).toBe(true);
      component.toggleNotifications('mobile');
      expect(component.moreMenuOpen()).toBe(false);
    });
  });

  // ─── toggleUserMenu() ─────────────────────────────────────────────────────

  describe('toggleUserMenu()', () => {
    beforeEach(() => setup());

    it('should set userMenuSource to the given source', () => {
      expect(component.userMenuSource()).toBeNull();
      component.toggleUserMenu('sidebar');
      expect(component.userMenuSource()).toBe('sidebar');
    });

    it('should close user menu when toggled with the same source', () => {
      component.toggleUserMenu('topbar');
      component.toggleUserMenu('topbar');
      expect(component.userMenuSource()).toBeNull();
    });

    it('should close notifications when opening user menu', () => {
      component.toggleNotifications('topbar');
      expect(component.notificationSource()).toBe('topbar');
      component.toggleUserMenu('topbar');
      expect(component.notificationSource()).toBeNull();
    });
  });

  // ─── toggleMoreMenu() ─────────────────────────────────────────────────────

  describe('toggleMoreMenu()', () => {
    beforeEach(() => setup());

    it('should toggle moreMenuOpen', () => {
      expect(component.moreMenuOpen()).toBe(false);
      component.toggleMoreMenu();
      expect(component.moreMenuOpen()).toBe(true);
      component.toggleMoreMenu();
      expect(component.moreMenuOpen()).toBe(false);
    });

    it('should close notifications when opening more menu', () => {
      component.toggleNotifications('mobile');
      expect(component.notificationSource()).toBe('mobile');
      component.toggleMoreMenu();
      expect(component.notificationSource()).toBeNull();
    });

    it('should close user menu when opening more menu', () => {
      component.toggleUserMenu('topbar');
      expect(component.userMenuSource()).toBe('topbar');
      component.toggleMoreMenu();
      expect(component.userMenuSource()).toBeNull();
    });
  });

  // ─── respondToInvitation() ────────────────────────────────────────────────

  describe('respondToInvitation()', () => {
    beforeEach(() => setup([mockInvitation]));

    it('should call notificationService.respondToInvitation with correct args', () => {
      component.respondToInvitation(1, true);
      expect(notificationServiceSpy.respondToInvitation).toHaveBeenCalledWith(1, true);
    });

    it('should call respondToInvitation with accept=false when rejecting', () => {
      component.respondToInvitation(1, false);
      expect(notificationServiceSpy.respondToInvitation).toHaveBeenCalledWith(1, false);
    });
  });

  // ─── dismissToast() ───────────────────────────────────────────────────────

  describe('dismissToast()', () => {
    beforeEach(() => setup());

    it('should call notificationService.dismissToast', () => {
      component.dismissToast();
      expect(notificationServiceSpy.dismissToast).toHaveBeenCalled();
    });
  });

  // ─── logout() ─────────────────────────────────────────────────────────────

  describe('logout()', () => {
    beforeEach(() => setup());

    it('should call disconnectSSE before logging out', () => {
      const disconnectOrder: string[] = [];
      notificationServiceSpy.disconnectSSE.mockImplementation(() => disconnectOrder.push('disconnect'));
      authServiceSpy.logout.mockImplementation(() => disconnectOrder.push('logout'));

      component.logout();

      expect(disconnectOrder[0]).toBe('disconnect');
      expect(disconnectOrder[1]).toBe('logout');
    });

    it('should call authService.logout', () => {
      component.logout();
      expect(authServiceSpy.logout).toHaveBeenCalled();
    });

    it('should call disconnectSSE', () => {
      component.logout();
      // disconnectSSE is called once in logout + once in ngOnDestroy when fixture tears down
      expect(notificationServiceSpy.disconnectSSE).toHaveBeenCalled();
    });
  });

  // ─── sseToast signal ──────────────────────────────────────────────────────

  describe('sseToast signal', () => {
    beforeEach(() => setup());

    it('should reflect null initially', () => {
      expect(component.sseToast()).toBeNull();
    });

    it('should reflect toast when notification service emits one', () => {
      notificationServiceSpy.sseToast.set(mockToast);
      expect(component.sseToast()).toEqual(mockToast);
    });

    it('should reflect null after toast is dismissed', () => {
      notificationServiceSpy.sseToast.set(mockToast);
      notificationServiceSpy.sseToast.set(null);
      expect(component.sseToast()).toBeNull();
    });
  });
});