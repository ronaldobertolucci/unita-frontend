import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TransferService } from '../../core/services/transfer.service';
import { PocketService } from '../../core/services/pocket.service';
import { GroupService } from '../../core/services/group.service';
import { AuthService } from '../../core/services/auth.service';
import { translateApiError } from '../../core/utils/api-error.util';
import { GroupPocketDto } from '../../core/services/transfer.service';

type TransferTab = 'own' | 'group';

@Component({
  selector: 'app-transfers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './transfers.component.html',
  styleUrl: './transfers.component.css',
})
export class TransfersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly transferService = inject(TransferService);
  private readonly pocketService = inject(PocketService);
  private readonly groupService = inject(GroupService);
  private readonly authService = inject(AuthService);

  // ── Estado ──────────────────────────────────────────────────────
  readonly activeTab = signal<TransferTab>('own');
  readonly isSaving = signal(false);
  readonly isLoadingGroupPockets = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly selectedSourceId = signal<number | null>(null);

  // Pockets do grupo selecionado (carregados sob demanda)
  readonly groupPockets = signal<GroupPocketDto[]>([]);

  // ── Dados ────────────────────────────────────────────────────────
  readonly pockets = this.pocketService.pockets;
  readonly groups = this.groupService.myGroups;

  readonly eligibleSourcePockets = computed(() =>
    this.pockets().filter(p => p.type === 'BANK_ACCOUNT' || p.type === 'CASH')
  );

  readonly eligibleTargetPockets = computed(() =>
    this.eligibleSourcePockets().filter(p => p.id !== this.selectedSourceId())
  );

  // Membros do grupo selecionado (exclui o próprio usuário)
  readonly groupMembers = computed(() => {
    const currentUserId = this.authService.currentUser()?.id;
    const seen = new Set<number>();
    return this.groupPockets()
      .filter(p => {
        if (p.user.id === currentUserId) return false;
        if (seen.has(p.user.id)) return false;
        seen.add(p.user.id);
        return true;
      })
      .map(p => p.user);
  });

  // Pockets do membro selecionado
  readonly memberPockets = computed(() => {
    const memberId = Number(this.groupForm.get('targetMemberId')?.value);
    if (!memberId) return [];
    return this.groupPockets().filter(p => p.user.id === memberId);
  });

  readonly hasGroups = computed(() => this.groups().length > 0);

  // ── Formulários ──────────────────────────────────────────────────
  readonly ownForm = this.fb.group({
    sourcePocketId: [null as number | null, Validators.required],
    targetPocketId: [null as number | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: ['', Validators.required],
  });

  readonly groupForm = this.fb.group({
    sourcePocketId: [null as number | null, Validators.required],
    groupId: [null as number | null, Validators.required],
    targetMemberId: [null as number | null, Validators.required],
    targetPocketId: [null as number | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: ['', Validators.required],
  });

  // ── Atalhos de controle ──────────────────────────────────────────
  get ownSource() { return this.ownForm.get('sourcePocketId')!; }
  get ownTarget() { return this.ownForm.get('targetPocketId')!; }
  get ownAmount() { return this.ownForm.get('amount')!; }
  get ownDescription() { return this.ownForm.get('description')!; }

  get grpSource() { return this.groupForm.get('sourcePocketId')!; }
  get grpGroup() { return this.groupForm.get('groupId')!; }
  get grpMember() { return this.groupForm.get('targetMemberId')!; }
  get grpTarget() { return this.groupForm.get('targetPocketId')!; }
  get grpAmount() { return this.groupForm.get('amount')!; }
  get grpDescription() { return this.groupForm.get('description')!; }

  // ── Lifecycle ────────────────────────────────────────────────────
  ngOnInit(): void {
    this.pocketService.loadPockets().subscribe();
    this.groupService.loadMyGroups$().subscribe();

    this.ownForm.get('sourcePocketId')!.valueChanges.subscribe(val => {
      this.selectedSourceId.set(Number(val));
    });
  }

  // ── Ações ────────────────────────────────────────────────────────
  setTab(tab: TransferTab): void {
    this.activeTab.set(tab);
    this.clearMessages();
  }

  onSourceChange(): void {
    this.ownForm.patchValue({ targetPocketId: null });
  }

  onGroupChange(): void {
    const groupId = Number(this.groupForm.get('groupId')?.value);
    this.groupForm.patchValue({ targetMemberId: null, targetPocketId: null });
    this.groupPockets.set([]);

    if (!groupId) return;

    this.isLoadingGroupPockets.set(true);
    this.transferService.getGroupPockets(groupId).subscribe({
      next: pockets => {
        this.groupPockets.set(pockets);
        this.isLoadingGroupPockets.set(false);
      },
      error: err => {
        this.errorMessage.set(translateApiError(err?.error?.message));
        this.isLoadingGroupPockets.set(false);
      },
    });
  }

  onMemberChange(): void {
    this.groupForm.patchValue({ targetPocketId: null });
  }

  submitOwnTransfer(): void {
    if (this.ownForm.invalid) {
      this.ownForm.markAllAsTouched();
      return;
    }
    this.clearMessages();
    this.isSaving.set(true);

    const { sourcePocketId, targetPocketId, amount, description } = this.ownForm.value;
    this.transferService.transfer({
      sourcePocketId: sourcePocketId!,
      targetPocketId: targetPocketId!,
      amount: amount!,
      description: description!,
    }).subscribe({
      next: () => {
        this.pocketService.loadPockets().subscribe();
        this.ownForm.reset();
        this.successMessage.set('Transferência realizada com sucesso!');
        this.isSaving.set(false);
      },
      error: err => {
        this.errorMessage.set(translateApiError(err?.error?.message));
        this.isSaving.set(false);
      },
    });
  }

  submitGroupTransfer(): void {
    if (this.groupForm.invalid) {
      this.groupForm.markAllAsTouched();
      return;
    }
    this.clearMessages();
    this.isSaving.set(true);

    const { sourcePocketId, targetPocketId, amount, description } = this.groupForm.value;
    this.transferService.transfer({
      sourcePocketId: sourcePocketId!,
      targetPocketId: targetPocketId!,
      amount: amount!,
      description: description!,
    }).subscribe({
      next: () => {
        this.pocketService.loadPockets().subscribe();
        this.groupForm.reset();
        this.groupPockets.set([]);
        this.successMessage.set('Transferência realizada com sucesso!');
        this.isSaving.set(false);
      },
      error: err => {
        this.errorMessage.set(translateApiError(err?.error?.message));
        this.isSaving.set(false);
      },
    });
  }

  getPocketLabel(id: number): string {
    return this.pockets().find(p => p.id === id)?.label ?? '';
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }
}