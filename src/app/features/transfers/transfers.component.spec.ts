import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { TransfersComponent } from './transfers.component';
import { TransferService } from '../../core/services/transfer.service';
import { PocketService } from '../../core/services/pocket.service';
import { GroupService } from '../../core/services/group.service';
import { AuthService } from '../../core/services/auth.service';
import { RouterTestingModule } from '@angular/router/testing';

const mockPockets = [
  { id: 1, type: 'BANK_ACCOUNT',          label: 'Nubank',   balance: 1000 },
  { id: 2, type: 'CASH',                  label: 'Carteira', balance: 200  },
  { id: 3, type: 'BENEFIT_ACCOUNT',       label: 'VR',       balance: 300  },
  { id: 4, type: 'FGTS_EMPLOYER_ACCOUNT', label: 'FGTS Empresa X', balance: 5000 },
];

const mockPocketsWithoutFgts = mockPockets.filter(p => p.type !== 'FGTS_EMPLOYER_ACCOUNT');

const mockGroups = [{ id: 10, name: 'Família' }];

const mockGroupPockets = [
  { id: 5, type: 'BANK_ACCOUNT', label: 'Conta Ana', user: { id: 2, firstName: 'Ana', lastName: 'Silva', email: 'ana@test.com' } },
  { id: 6, type: 'CASH', label: 'Carteira Ana', user: { id: 2, firstName: 'Ana', lastName: 'Silva', email: 'ana@test.com' } },
];

function buildTransferService() {
  return {
    transfer: jest.fn(),
    fgtsWithdrawal: jest.fn(),
    getGroupPockets: jest.fn(),
  };
}

function buildPocketService(pockets = mockPockets) {
  return {
    pockets: signal(pockets),
    loadPockets: jest.fn().mockReturnValue(of(void 0)),
  };
}

function buildGroupService(groupsData = mockGroups) {
  return {
    myGroups: signal(groupsData),
    loadMyGroups$: jest.fn().mockReturnValue(of(void 0)),
  };
}

function buildAuthService(userId = 1) {
  return {
    currentUser: signal({ id: userId, firstName: 'João', lastName: 'Silva', email: 'joao@test.com' }),
  };
}

describe('TransfersComponent', () => {
  let fixture: ComponentFixture<TransfersComponent>;
  let component: TransfersComponent;
  let transferServiceSpy: ReturnType<typeof buildTransferService>;
  let pocketServiceSpy: ReturnType<typeof buildPocketService>;
  let groupServiceSpy: ReturnType<typeof buildGroupService>;

  function setup(pockets = mockPockets, groups = mockGroups) {
    transferServiceSpy = buildTransferService();
    pocketServiceSpy   = buildPocketService(pockets);
    groupServiceSpy    = buildGroupService(groups);

    TestBed.configureTestingModule({
      imports: [TransfersComponent, RouterTestingModule],
      providers: [
        { provide: TransferService, useValue: transferServiceSpy },
        { provide: PocketService,   useValue: pocketServiceSpy },
        { provide: GroupService,    useValue: groupServiceSpy },
        { provide: AuthService,     useValue: buildAuthService() },
      ],
    });

    fixture   = TestBed.createComponent(TransfersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  describe('initialization', () => {
    beforeEach(() => setup());

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should load pockets and groups on init', () => {
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalled();
      expect(groupServiceSpy.loadMyGroups$).toHaveBeenCalled();
    });

    it('should start on own tab', () => {
      expect(component.activeTab()).toBe('own');
    });

    it('should start with no messages', () => {
      expect(component.errorMessage()).toBeNull();
      expect(component.successMessage()).toBeNull();
    });
  });

  // ─── eligibleSourcePockets ────────────────────────────────────────────────

  describe('eligibleSourcePockets', () => {
    beforeEach(() => setup());

    it('should return only BANK_ACCOUNT and CASH pockets', () => {
      const result = component.eligibleSourcePockets();
      expect(result.length).toBe(2);
      expect(result.every(p => p.type === 'BANK_ACCOUNT' || p.type === 'CASH')).toBe(true);
    });
  });

  // ─── eligibleTargetPockets ────────────────────────────────────────────────

  describe('eligibleTargetPockets', () => {
    beforeEach(() => setup());

    it('should exclude the selected source pocket', () => {
      component.ownForm.patchValue({ sourcePocketId: 1 });
      expect(component.eligibleTargetPockets().find(p => p.id === 1)).toBeUndefined();
    });

    it('should return all eligible pockets when no source is selected', () => {
      expect(component.eligibleTargetPockets().length).toBe(2);
    });
  });

  // ─── fgtsPockets ─────────────────────────────────────────────────────────

  describe('fgtsPockets', () => {
    it('should return only FGTS_EMPLOYER_ACCOUNT pockets', () => {
      setup(mockPockets);
      const result = component.fgtsPockets();
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('FGTS_EMPLOYER_ACCOUNT');
      expect(result[0].id).toBe(4);
    });

    it('should return empty array when there are no FGTS pockets', () => {
      setup(mockPocketsWithoutFgts);
      expect(component.fgtsPockets()).toEqual([]);
    });
  });

  // ─── hasFgtsPockets ──────────────────────────────────────────────────────

  describe('hasFgtsPockets', () => {
    it('should return true when FGTS pockets exist', () => {
      setup(mockPockets);
      expect(component.hasFgtsPockets()).toBe(true);
    });

    it('should return false when no FGTS pockets exist', () => {
      setup(mockPocketsWithoutFgts);
      expect(component.hasFgtsPockets()).toBe(false);
    });
  });

  // ─── hasGroups ────────────────────────────────────────────────────────────

  describe('hasGroups', () => {
    it('should return true when groups exist', () => {
      setup(mockPockets, mockGroups);
      expect(component.hasGroups()).toBe(true);
    });

    it('should return false when no groups exist', () => {
      setup(mockPockets, []);
      expect(component.hasGroups()).toBe(false);
    });
  });

  // ─── setTab() ─────────────────────────────────────────────────────────────

  describe('setTab()', () => {
    beforeEach(() => setup());

    it('should switch active tab', () => {
      component.setTab('group');
      expect(component.activeTab()).toBe('group');
    });

    it('should switch to fgts tab', () => {
      component.setTab('fgts');
      expect(component.activeTab()).toBe('fgts');
    });

    it('should clear error and success messages', () => {
      component['errorMessage'].set('erro');
      component['successMessage'].set('sucesso');
      component.setTab('group');
      expect(component.errorMessage()).toBeNull();
      expect(component.successMessage()).toBeNull();
    });
  });

  // ─── onSourceChange() ─────────────────────────────────────────────────────

  describe('onSourceChange()', () => {
    beforeEach(() => setup());

    it('should reset targetPocketId', () => {
      component.ownForm.patchValue({ sourcePocketId: 1, targetPocketId: 2 });
      component.onSourceChange();
      expect(component.ownForm.get('targetPocketId')?.value).toBeNull();
    });
  });

  // ─── onGroupChange() ──────────────────────────────────────────────────────

  describe('onGroupChange()', () => {
    beforeEach(() => setup());

    it('should call getGroupPockets and populate groupPockets', () => {
      transferServiceSpy.getGroupPockets.mockReturnValue(of(mockGroupPockets));
      component.groupForm.patchValue({ groupId: 10 });
      component.onGroupChange();
      expect(transferServiceSpy.getGroupPockets).toHaveBeenCalledWith(10);
      expect(component.groupPockets()).toEqual(mockGroupPockets);
    });

    it('should reset targetMemberId and targetPocketId', () => {
      transferServiceSpy.getGroupPockets.mockReturnValue(of(mockGroupPockets));
      component.groupForm.patchValue({ groupId: 10, targetMemberId: 2, targetPocketId: 5 });
      component.onGroupChange();
      expect(component.groupForm.get('targetMemberId')?.value).toBeNull();
      expect(component.groupForm.get('targetPocketId')?.value).toBeNull();
    });

    it('should set errorMessage on getGroupPockets failure', () => {
      transferServiceSpy.getGroupPockets.mockReturnValue(throwError(() => ({ error: { message: 'Erro' } })));
      component.groupForm.patchValue({ groupId: 10 });
      component.onGroupChange();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isLoadingGroupPockets()).toBe(false);
    });
  });

  // ─── onMemberChange() ─────────────────────────────────────────────────────

  describe('onMemberChange()', () => {
    beforeEach(() => setup());

    it('should reset targetPocketId', () => {
      component.groupForm.patchValue({ targetPocketId: 5 });
      component.onMemberChange();
      expect(component.groupForm.get('targetPocketId')?.value).toBeNull();
    });
  });

  // ─── groupMembers ─────────────────────────────────────────────────────────

  describe('groupMembers', () => {
    beforeEach(() => setup());

    it('should exclude the current user', () => {
      component.groupPockets.set([
        ...mockGroupPockets,
        { id: 7, type: 'CASH', label: 'Carteira João', user: { id: 1, firstName: 'João', lastName: 'Silva', email: 'joao@test.com' } },
      ]);
      expect(component.groupMembers().find(m => m.id === 1)).toBeUndefined();
    });

    it('should deduplicate members with multiple pockets', () => {
      component.groupPockets.set(mockGroupPockets);
      expect(component.groupMembers().length).toBe(1);
    });
  });

  // ─── memberPockets ────────────────────────────────────────────────────────

  describe('memberPockets', () => {
    beforeEach(() => setup());

    it('should return pockets filtered by selected member', () => {
      component.groupPockets.set(mockGroupPockets);
      component.groupForm.patchValue({ targetMemberId: 2 });
      expect(component.memberPockets().length).toBe(2);
    });

    it('should return empty array when no member is selected', () => {
      component.groupPockets.set(mockGroupPockets);
      expect(component.memberPockets()).toEqual([]);
    });
  });

  // ─── submitOwnTransfer() ──────────────────────────────────────────────────

  describe('submitOwnTransfer()', () => {
    beforeEach(() => setup());

    it('should mark form as touched when invalid', () => {
      component.submitOwnTransfer();
      expect(component.ownForm.touched).toBe(true);
      expect(transferServiceSpy.transfer).not.toHaveBeenCalled();
    });

    it('should call transfer with correct payload on success', () => {
      transferServiceSpy.transfer.mockReturnValue(of(void 0));
      component.ownForm.setValue({ sourcePocketId: 1, targetPocketId: 2, amount: 100, description: 'Teste' });
      component.submitOwnTransfer();
      expect(transferServiceSpy.transfer).toHaveBeenCalledWith({
        sourcePocketId: 1, targetPocketId: 2, amount: 100, description: 'Teste',
      });
    });

    it('should reload pockets and show success message on success', () => {
      transferServiceSpy.transfer.mockReturnValue(of(void 0));
      component.ownForm.setValue({ sourcePocketId: 1, targetPocketId: 2, amount: 100, description: 'Teste' });
      component.submitOwnTransfer();
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalledTimes(2);
      expect(component.successMessage()).toBeTruthy();
    });

    it('should reset form on success', () => {
      transferServiceSpy.transfer.mockReturnValue(of(void 0));
      component.ownForm.setValue({ sourcePocketId: 1, targetPocketId: 2, amount: 100, description: 'Teste' });
      component.submitOwnTransfer();
      expect(component.ownForm.get('sourcePocketId')?.value).toBeNull();
    });

    it('should set errorMessage and stop saving on failure', () => {
      transferServiceSpy.transfer.mockReturnValue(throwError(() => ({ error: { message: 'Saldo insuficiente' } })));
      component.ownForm.setValue({ sourcePocketId: 1, targetPocketId: 2, amount: 100, description: 'Teste' });
      component.submitOwnTransfer();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── submitGroupTransfer() ────────────────────────────────────────────────

  describe('submitGroupTransfer()', () => {
    beforeEach(() => setup());

    it('should mark form as touched when invalid', () => {
      component.submitGroupTransfer();
      expect(component.groupForm.touched).toBe(true);
      expect(transferServiceSpy.transfer).not.toHaveBeenCalled();
    });

    it('should call transfer with correct payload on success', () => {
      transferServiceSpy.transfer.mockReturnValue(of(void 0));
      component.groupForm.setValue({ sourcePocketId: 1, groupId: 10, targetMemberId: 2, targetPocketId: 5, amount: 50, description: 'Reembolso' });
      component.submitGroupTransfer();
      expect(transferServiceSpy.transfer).toHaveBeenCalledWith({
        sourcePocketId: 1, targetPocketId: 5, amount: 50, description: 'Reembolso',
      });
    });

    it('should reset groupPockets and show success message on success', () => {
      transferServiceSpy.transfer.mockReturnValue(of(void 0));
      component.groupPockets.set(mockGroupPockets);
      component.groupForm.setValue({ sourcePocketId: 1, groupId: 10, targetMemberId: 2, targetPocketId: 5, amount: 50, description: 'Reembolso' });
      component.submitGroupTransfer();
      expect(component.groupPockets()).toEqual([]);
      expect(component.successMessage()).toBeTruthy();
    });

    it('should set errorMessage and stop saving on failure', () => {
      transferServiceSpy.transfer.mockReturnValue(throwError(() => ({ error: { message: 'Saldo insuficiente' } })));
      component.groupForm.setValue({ sourcePocketId: 1, groupId: 10, targetMemberId: 2, targetPocketId: 5, amount: 50, description: 'Reembolso' });
      component.submitGroupTransfer();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });
  });

  // ─── submitFgtsWithdrawal() ───────────────────────────────────────────────

  describe('submitFgtsWithdrawal()', () => {
    beforeEach(() => setup());

    it('should mark form as touched when invalid', () => {
      component.submitFgtsWithdrawal();
      expect(component.fgtsForm.touched).toBe(true);
      expect(transferServiceSpy.fgtsWithdrawal).not.toHaveBeenCalled();
    });

    it('should call fgtsWithdrawal with correct payload on success', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(of(void 0));
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(transferServiceSpy.fgtsWithdrawal).toHaveBeenCalledWith({
        sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário',
      });
    });

    it('should not call transfer() — only fgtsWithdrawal()', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(of(void 0));
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(transferServiceSpy.transfer).not.toHaveBeenCalled();
    });

    it('should reload pockets and show success message on success', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(of(void 0));
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(pocketServiceSpy.loadPockets).toHaveBeenCalledTimes(2);
      expect(component.successMessage()).toBe('Saque de FGTS realizado com sucesso!');
    });

    it('should reset form on success', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(of(void 0));
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(component.fgtsForm.get('sourcePocketId')?.value).toBeNull();
      expect(component.fgtsForm.get('targetPocketId')?.value).toBeNull();
      expect(component.fgtsForm.get('amount')?.value).toBeNull();
      expect(component.fgtsForm.get('description')?.value).toBeNull();
    });

    it('should stop saving after success', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(of(void 0));
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(component.isSaving()).toBe(false);
    });

    it('should set errorMessage and stop saving on failure', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(throwError(() => ({ error: { message: 'Saldo insuficiente' } })));
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    });

    it('should clear previous messages before submitting', () => {
      transferServiceSpy.fgtsWithdrawal.mockReturnValue(of(void 0));
      component['errorMessage'].set('erro anterior');
      component['successMessage'].set('sucesso anterior');
      component.fgtsForm.setValue({ sourcePocketId: 4, targetPocketId: 1, amount: 1500, description: 'Saque aniversário' });
      component.submitFgtsWithdrawal();
      expect(component.errorMessage()).toBeNull();
    });
  });
});