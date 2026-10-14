import { TransferResultDto } from '../../core/models/transaction.model';
import { financialWriteErrorMessage, isUncertainFinancialWrite } from '../../core/utils/financial-operation.util';
import { FinancialRecoveryService } from '../../core/services/financial-recovery.service';
import { FinancialRecoveryComponent } from '../../shared/financial-recovery/financial-recovery.component';
import { Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TransferService } from '../../core/services/transfer.service';
import { PocketService } from '../../core/services/pocket.service';
import { GroupService } from '../../core/services/group.service';
import { AuthService } from '../../core/services/auth.service';
import { translateApiError } from '../../core/utils/api-error.util';
import { GroupPocketDto } from '../../core/services/transfer.service';
import { PageContextService } from '../../core/services/page-context.service';

type TransferTab = 'own' | 'group' | 'fgts';

@Component({
  selector: 'app-transfers',
  standalone: true,
  imports: [FinancialRecoveryComponent, CommonModule, ReactiveFormsModule],
  templateUrl: './transfers.component.html',
  styleUrl: './transfers.component.css',
})
export class TransfersComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  readonly financialRecovery = inject(FinancialRecoveryService);
  private readonly fb = inject(FormBuilder);
  private readonly transferService = inject(TransferService);
  private readonly pocketService = inject(PocketService);
  private readonly groupService = inject(GroupService);
  private readonly authService = inject(AuthService);
  private pageContextService = inject(PageContextService);

  // ── Estado ──────────────────────────────────────────────────────
  readonly activeTab = signal<TransferTab>('own');
  readonly isSaving = signal(false);
  readonly isLoadingGroupPockets = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly lastResult = signal<TransferResultDto | null>(null);
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

  readonly fgtsPockets = computed(() =>
    this.pockets().filter(p => p.type === 'FGTS_EMPLOYER_ACCOUNT')
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
  readonly hasFgtsPockets = computed(() => this.fgtsPockets().length > 0);

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

  readonly fgtsForm = this.fb.group({
    sourcePocketId: [null as number | null, Validators.required],
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

  get fgtsSource() { return this.fgtsForm.get('sourcePocketId')!; }
  get fgtsTarget() { return this.fgtsForm.get('targetPocketId')!; }
  get fgtsAmount() { return this.fgtsForm.get('amount')!; }
  get fgtsDescription() { return this.fgtsForm.get('description')!; }

  // ── Lifecycle ────────────────────────────────────────────────────
  ngOnInit(): void {
    this.pocketService.loadPockets().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.groupService.loadMyGroups$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    this.ownForm.get('sourcePocketId')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(val => {
      this.selectedSourceId.set(Number(val));
    });

    this.pageContextService.pageSubtitle.set('Mova valores entre seus pockets ou para membros de um grupo');
  }

  ngOnDestroy(): void {
    this.pageContextService.clear();
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
    this.transferService.getGroupPockets(groupId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    if (this.ownForm.invalid) {
      this.ownForm.markAllAsTouched();
      return;
    }
    const { sourcePocketId, targetPocketId, amount, description } = this.ownForm.value;
    if (!this.validateSelection('own', Number(sourcePocketId), Number(targetPocketId), amount!)) return;
    this.clearMessages();
    this.isSaving.set(true);
    this.financialRecovery.trackWrite({
      label: `${description} · ${this.formatAmount(amount!)}`,
      pocketIds: [Number(sourcePocketId), Number(targetPocketId)],
    }, this.transferService.transfer({
      sourcePocketId: Number(sourcePocketId),
      targetPocketId: Number(targetPocketId),
      amount: amount!,
      description: description!,
    })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.lastResult.set(result);
        this.refreshAfterTransfer(sourcePocketId!, targetPocketId!, result);
        this.ownForm.reset();
        this.successMessage.set('Transferência realizada com sucesso!');
      },
      error: err => {
        this.handleTransferError(err, sourcePocketId!, targetPocketId!, amount!, description!);
      },
    });
  }

  submitGroupTransfer(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    if (this.groupForm.invalid) {
      this.groupForm.markAllAsTouched();
      return;
    }
    const { sourcePocketId, targetPocketId, amount, description } = this.groupForm.value;
    if (!this.validateSelection('group', Number(sourcePocketId), Number(targetPocketId), amount!)) return;
    this.clearMessages();
    this.isSaving.set(true);
    this.financialRecovery.trackWrite({
      label: `${description} · ${this.formatAmount(amount!)}`,
      pocketIds: [Number(sourcePocketId), Number(targetPocketId)],
    }, this.transferService.transfer({
      sourcePocketId: Number(sourcePocketId),
      targetPocketId: Number(targetPocketId),
      amount: amount!,
      description: description!,
    })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.lastResult.set(result);
        this.refreshAfterTransfer(sourcePocketId!, targetPocketId!, result);
        this.groupForm.reset();
        this.groupPockets.set([]);
        this.successMessage.set('Transferência realizada com sucesso!');
      },
      error: err => {
        this.handleTransferError(err, sourcePocketId!, targetPocketId!, amount!, description!);
      },
    });
  }

  submitFgtsWithdrawal(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    if (this.fgtsForm.invalid) {
      this.fgtsForm.markAllAsTouched();
      return;
    }
    const { sourcePocketId, targetPocketId, amount, description } = this.fgtsForm.value;
    if (!this.validateSelection('fgts', Number(sourcePocketId), Number(targetPocketId), amount!)) return;
    this.clearMessages();
    this.isSaving.set(true);
    this.financialRecovery.trackWrite({
      label: `${description} · ${this.formatAmount(amount!)}`,
      pocketIds: [Number(sourcePocketId), Number(targetPocketId)],
    }, this.transferService.fgtsWithdrawal({
      sourcePocketId: Number(sourcePocketId),
      targetPocketId: Number(targetPocketId),
      amount: amount!,
      description: description!,
    })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.lastResult.set(result);
        this.refreshAfterTransfer(sourcePocketId!, targetPocketId!, result);
        this.fgtsForm.reset();
        this.successMessage.set('Saque de FGTS realizado com sucesso!');
      },
      error: err => {
        this.handleTransferError(err, sourcePocketId!, targetPocketId!, amount!, description!);
      },
    });
  }

  private validateSelection(tab: TransferTab, sourceId: number, targetId: number, amount: number): boolean {
    const sources = tab === 'fgts' ? this.fgtsPockets() : this.eligibleSourcePockets();
    const source = sources.find(p => p.id === sourceId);
    const targetAllowed = tab === 'group'
      ? this.groupPockets().some(p => p.id === targetId && p.user.id !== this.authService.currentUser()?.id && p.user.id === Number(this.groupForm.value.targetMemberId))
      : this.eligibleSourcePockets().some(p => p.id === targetId);
    if (!source || !targetAllowed || sourceId === targetId) {
      this.errorMessage.set('Revise as contas de origem e destino antes de enviar.');
      return false;
    }
    if (amount > source.balance) {
      this.errorMessage.set('Saldo exibido insuficiente no pocket de origem. Revise o valor ou atualize as contas.');
      return false;
    }
    return true;
  }

  private refreshAfterTransfer(sourceId: number, targetId: number, result: TransferResultDto): void {
    this.financialRecovery.refreshPockets([sourceId, targetId]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: pockets => {
        const missing = pockets.some(p => !p.transactions.some(tx => tx.id ===
          (p.id === Number(sourceId) ? result.sourceTransaction.id : result.targetTransaction.id)));
        this.isSaving.set(false);
        if (missing) this.errorMessage.set('Operação realizada. Confira os extratos: os lançamentos ainda não foram localizados na consulta.');
      },
      error: () => {
        this.isSaving.set(false);
        this.financialRecovery.mark({ label: 'Atualização após transferência ou saque', pocketIds: [sourceId, targetId], message: 'A operação foi realizada, mas os saldos e extratos não puderam ser atualizados. Confira os dados antes de uma nova operação.' });
        this.financialRecovery.check();
      },
    });
  }

  private handleTransferError(error: any, sourceId: number, targetId: number, amount: number, description: string): void {
    if (isUncertainFinancialWrite(error)) {
      this.financialRecovery.mark({
        label: `${description} · ${this.formatAmount(amount)}`,
        pocketIds: [sourceId, targetId],
        message: financialWriteErrorMessage(error, 'Erro ao realizar operação.'),
      });
      this.isSaving.set(false);
      this.financialRecovery.check();
      this.errorMessage.set(null);
    } else {
      this.errorMessage.set(financialWriteErrorMessage(error, 'Erro ao realizar operação.'));
      this.financialRecovery.refreshPockets([sourceId, targetId]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => this.isSaving.set(false),
        error: () => {
          this.isSaving.set(false);
          this.financialRecovery.mark({ label: 'Conferência após operação rejeitada', pocketIds: [sourceId, targetId], message: 'A operação foi rejeitada, mas não foi possível atualizar as contas. Consulte os dados antes de enviar novamente.' });
        },
      });
      if (error.status === 404) {
        this.ownForm.patchValue({ sourcePocketId: null, targetPocketId: null });
        this.fgtsForm.patchValue({ sourcePocketId: null, targetPocketId: null });
        this.groupForm.patchValue({ sourcePocketId: null, targetPocketId: null, targetMemberId: null });
        this.groupPockets.set([]);
      }
    }
  }

  getPocketLabel(id: number): string {
    return this.pockets().find(p => p.id === id)?.label ?? '';
  }

  private formatAmount(amount: number): string {
    return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }
}