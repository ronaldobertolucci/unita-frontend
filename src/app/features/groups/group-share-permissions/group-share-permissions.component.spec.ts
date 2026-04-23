import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { GroupSharePermissionsComponent } from './group-share-permissions.component';
import { GroupService, SharePermissionDto } from '../../../core/services/group.service';
import { RouterTestingModule } from '@angular/router/testing';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPermissions: SharePermissionDto[] = [
  { shareType: 'BALANCE',              enabled: true  },
  { shareType: 'CREDIT_CARD_BILLS',    enabled: false },
  { shareType: 'INVESTMENTS',          enabled: true  },
  { shareType: 'EXPENSES_BY_CATEGORY', enabled: false },
  { shareType: 'INCOME_BY_CATEGORY',   enabled: true  },
];

const allEnabled: SharePermissionDto[] = [
  { shareType: 'BALANCE',              enabled: true },
  { shareType: 'CREDIT_CARD_BILLS',    enabled: true },
  { shareType: 'INVESTMENTS',          enabled: true },
  { shareType: 'EXPENSES_BY_CATEGORY', enabled: true },
  { shareType: 'INCOME_BY_CATEGORY',   enabled: true },
];

const allDisabled: SharePermissionDto[] = [
  { shareType: 'BALANCE',              enabled: false },
  { shareType: 'CREDIT_CARD_BILLS',    enabled: false },
  { shareType: 'INVESTMENTS',          enabled: false },
  { shareType: 'EXPENSES_BY_CATEGORY', enabled: false },
  { shareType: 'INCOME_BY_CATEGORY',   enabled: false },
];

// ── Mock factory ──────────────────────────────────────────────────────────────

function buildGroupService(permissions = mockPermissions) {
  return {
    getSharePermissions:   jest.fn().mockReturnValue(of(permissions)),
    updateSharePermissions: jest.fn().mockReturnValue(of(permissions)),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('GroupSharePermissionsComponent', () => {
  let fixture: ComponentFixture<GroupSharePermissionsComponent>;
  let component: GroupSharePermissionsComponent;
  let groupServiceSpy: ReturnType<typeof buildGroupService>;

  function setup(permissions = mockPermissions) {
    groupServiceSpy = buildGroupService(permissions);

    TestBed.configureTestingModule({
      imports: [GroupSharePermissionsComponent, RouterTestingModule],
      providers: [{ provide: GroupService, useValue: groupServiceSpy }],
    });

    fixture   = TestBed.createComponent(GroupSharePermissionsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('groupId', 10);
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should call getSharePermissions with the provided groupId', () => {
      expect(groupServiceSpy.getSharePermissions).toHaveBeenCalledWith(10);
    });

    it('should set isLoading to false after loading', () => {
      expect(component.isLoading()).toBe(false);
    });

    it('should populate permissions with 5 items', () => {
      expect(component.permissions().length).toBe(5);
    });

    it('should preserve enabled state from API response', () => {
      const balance = component.permissions().find(p => p.shareType === 'BALANCE');
      expect(balance?.enabled).toBe(true);

      const bills = component.permissions().find(p => p.shareType === 'CREDIT_CARD_BILLS');
      expect(bills?.enabled).toBe(false);
    });

    it('should display permissions in fixed order', () => {
      const types = component.permissions().map(p => p.shareType);
      expect(types[0]).toBe('BALANCE');
      expect(types[1]).toBe('CREDIT_CARD_BILLS');
      expect(types[2]).toBe('INVESTMENTS');
      expect(types[3]).toBe('EXPENSES_BY_CATEGORY');
      expect(types[4]).toBe('INCOME_BY_CATEGORY');
    });

    it('should have correct labels for each shareType', () => {
      const balance = component.permissions().find(p => p.shareType === 'BALANCE');
      expect(balance?.label).toBe('Saldo dos pockets');

      const bills = component.permissions().find(p => p.shareType === 'CREDIT_CARD_BILLS');
      expect(bills?.label).toBe('Faturas de cartão');

      const investments = component.permissions().find(p => p.shareType === 'INVESTMENTS');
      expect(investments?.label).toBe('Investimentos');

      const expenses = component.permissions().find(p => p.shareType === 'EXPENSES_BY_CATEGORY');
      expect(expenses?.label).toBe('Despesas por categoria');

      const income = component.permissions().find(p => p.shareType === 'INCOME_BY_CATEGORY');
      expect(income?.label).toBe('Receitas por categoria');
    });
  });

  // ─── Loading state ────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('should set errorMessage on getSharePermissions failure', () => {
      groupServiceSpy = buildGroupService();
      groupServiceSpy.getSharePermissions.mockReturnValue(
        throwError(() => ({ error: { message: 'Sem permissão' } }))
      );

      TestBed.configureTestingModule({
        imports: [GroupSharePermissionsComponent, RouterTestingModule],
        providers: [{ provide: GroupService, useValue: groupServiceSpy }],
      });

      fixture   = TestBed.createComponent(GroupSharePermissionsComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('groupId', 10);
      fixture.detectChanges();

      expect(component.errorMessage()).toBeTruthy();
      expect(component.isLoading()).toBe(false);
    });
  });

  // ─── toggle() ─────────────────────────────────────────────────────────────

  describe('toggle()', () => {
    beforeEach(() => setup());

    it('should enable a disabled permission', () => {
      component.toggle('CREDIT_CARD_BILLS');
      const bills = component.permissions().find(p => p.shareType === 'CREDIT_CARD_BILLS');
      expect(bills?.enabled).toBe(true);
    });

    it('should disable an enabled permission', () => {
      component.toggle('BALANCE');
      const balance = component.permissions().find(p => p.shareType === 'BALANCE');
      expect(balance?.enabled).toBe(false);
    });

    it('should only change the toggled permission', () => {
      const before = component.permissions().find(p => p.shareType === 'INVESTMENTS')?.enabled;
      component.toggle('BALANCE');
      const after = component.permissions().find(p => p.shareType === 'INVESTMENTS')?.enabled;
      expect(after).toBe(before);
    });

    it('should allow multiple toggles on the same permission', () => {
      const original = component.permissions().find(p => p.shareType === 'BALANCE')?.enabled;
      component.toggle('BALANCE');
      component.toggle('BALANCE');
      const restored = component.permissions().find(p => p.shareType === 'BALANCE')?.enabled;
      expect(restored).toBe(original);
    });
  });

  // ─── save() ───────────────────────────────────────────────────────────────

  describe('save()', () => {
    beforeEach(() => setup());

    it('should call updateSharePermissions with current permissions', () => {
      component.save();
      expect(groupServiceSpy.updateSharePermissions).toHaveBeenCalledWith(10, {
        permissions: component.permissions().map(p => ({
          shareType: p.shareType,
          enabled:   p.enabled,
        })),
      });
    });

    it('should send correct payload after toggling', () => {
      component.toggle('CREDIT_CARD_BILLS'); // false → true
      component.save();

      const [, payload] = groupServiceSpy.updateSharePermissions.mock.calls[0];
      const bills = payload.permissions.find((p: { shareType: string }) => p.shareType === 'CREDIT_CARD_BILLS');
      expect(bills.enabled).toBe(true);
    });

    it('should emit closed on success', () => {
      let emitted = false;
      component.closed.subscribe(() => (emitted = true));
      component.save();
      expect(emitted).toBe(true);
    });

    it('should set isSaving to false on success', () => {
      component.save();
      expect(component.isSaving()).toBe(false);
    });

    it('should set errorMessage and stop saving on failure', () => {
      groupServiceSpy.updateSharePermissions.mockReturnValue(
        throwError(() => ({ error: { message: 'Erro ao salvar' } }))
      );
      component.save();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });

    it('should clear previous errorMessage before saving', () => {
      groupServiceSpy.updateSharePermissions.mockReturnValue(of(allEnabled));
      component['errorMessage'].set('erro anterior');
      component.save();
      expect(component.errorMessage()).toBeNull();
    });

    it('should send all five shareTypes in the payload', () => {
      component.save();
      const [, payload] = groupServiceSpy.updateSharePermissions.mock.calls[0];
      expect(payload.permissions.length).toBe(5);
    });
  });

  // ─── close() ──────────────────────────────────────────────────────────────

  describe('close()', () => {
    beforeEach(() => setup());

    it('should emit closed event', () => {
      let emitted = false;
      component.closed.subscribe(() => (emitted = true));
      component.close();
      expect(emitted).toBe(true);
    });

    it('should not call updateSharePermissions', () => {
      component.close();
      expect(groupServiceSpy.updateSharePermissions).not.toHaveBeenCalled();
    });
  });

  // ─── All enabled / all disabled scenarios ─────────────────────────────────

  describe('edge cases', () => {
    it('should load all permissions as enabled correctly', () => {
      setup(allEnabled);
      expect(component.permissions().every(p => p.enabled)).toBe(true);
    });

    it('should load all permissions as disabled correctly', () => {
      setup(allDisabled);
      expect(component.permissions().every(p => p.enabled)).toBe(false);
    });

    it('should handle partial API response (missing shareTypes) with false fallback', () => {
      setup([{ shareType: 'BALANCE', enabled: true }]);
      const bills = component.permissions().find(p => p.shareType === 'CREDIT_CARD_BILLS');
      expect(bills?.enabled).toBe(false);
    });
  });
});