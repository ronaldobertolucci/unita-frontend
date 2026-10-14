import { Component, computed, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CreditCardService } from '../../../core/services/credit-card.service';
import { CategoryService } from '../../../core/services/category.service';
import { financialWriteErrorMessage, isUncertainFinancialWrite } from '../../../core/utils/financial-operation.util';
import { FinancialRecoveryService } from '../../../core/services/financial-recovery.service';
import { FinancialRecoveryComponent } from '../../../shared/financial-recovery/financial-recovery.component';
import {
  CreditCardInstallmentDto,
  CreditCardBillDto,
  BillInstallmentItem,
  BillRefundItem,
  CreditCardPurchaseDto,
} from '../../../core/models/credit-card.model';

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type ModalType =
  | 'move-installment'
  | 'create-refund'
  | 'confirm-delete-purchase'
  | 'confirm-delete-refund'
  | null;

/** Item unificado para exibição na lista da fatura */
interface BillDisplayItem {
  id: number;
  type: 'installment' | 'refund';
  date: string;
  description: string;
  amount: number;
  // installment
  installmentNumber?: number;
  totalInstallments?: number;
  purchaseId?: number;
  // refund
  refundId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-credit-card-bill-detail',
  standalone: true,
  imports: [FinancialRecoveryComponent, CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-card-bill-detail.component.html',
  styleUrl: './credit-card-bill-detail.component.css',
})
export class CreditCardBillDetailComponent implements OnInit {
  readonly financialRecovery = inject(FinancialRecoveryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly creditCardService = inject(CreditCardService);
  private readonly categoryService = inject(CategoryService);

  cardId!: number;
  billId!: number;

  // ─── Estado ──────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly activeModal = signal<ModalType>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly bill = signal<CreditCardBillDto | null>(null);
  readonly installments = signal<BillInstallmentItem[]>([]);
  readonly refunds = signal<BillRefundItem[]>([]);
  readonly bills = signal<CreditCardBillDto[]>([]);
  readonly purchaseInstallments = signal<Record<number, CreditCardInstallmentDto[]>>({});
  readonly compositionReady = signal(false);
  readonly selectedInstallment = signal<{ purchaseId: number; installment: CreditCardInstallmentDto } | null>(null);
  readonly moveForm = this.fb.group({ creditCardBillId: [null as number | null, Validators.required] });
  readonly openBills = computed(() => this.bills().filter(b => b.status === 'OPEN' && b.paymentId == null).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  readonly canChangeComposition = computed(() => this.compositionReady() && !this.isLoading() && this.bill()?.status === 'OPEN' && this.bill()?.paymentId == null);
  readonly purchases = signal<CreditCardPurchaseDto[]>([]);

  // ─── Estado de exclusão ───────────────────────────────────────────────────

  readonly selectedPurchaseId = signal<number | null>(null);
  readonly selectedPurchaseDescription = signal<string | null>(null);
  readonly selectedPurchaseTotalInstallments = signal<number | null>(null);
  readonly selectedRefundId = signal<number | null>(null);
  readonly selectedRefundDescription = signal<string | null>(null);

  // ─── Formulários ─────────────────────────────────────────────────────────

  readonly refundForm = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(255)]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    refundDate: ['', Validators.required],
    categoryId: [null as number | null, Validators.required],
  });

  // ─── Getters de controles ─────────────────────────────────────────────────

  get refDescription() { return this.refundForm.get('description')!; }
  get refAmount() { return this.refundForm.get('amount')!; }
  get refDate() { return this.refundForm.get('refundDate')!; }
  get refCategoryId() { return this.refundForm.get('categoryId')!; }

  // ─── Categorias filtradas ─────────────────────────────────────────────────

  readonly reimbursementCategoryId = computed(() =>
    this.categoryService.categories().find(c => c.name === 'Reembolsos')?.id ?? null
  );

  // ─── Lista unificada de exibição ──────────────────────────────────────────

  readonly displayItems = computed<BillDisplayItem[]>(() => {
    const installmentItems: BillDisplayItem[] = this.installments().map(inst => {
      const purchase = this.findPurchaseForInstallment(inst);
      return {
        id: inst.id,
        type: 'installment',
        date: this.purchaseInstallments()[purchase?.id ?? -1]?.find(i => i.id === inst.id)?.installmentDate ?? inst.purchaseDate,
        description: inst.description,
        amount: inst.amount,
        installmentNumber: inst.installmentNumber,
        totalInstallments: inst.totalInstallments,
        purchaseId: purchase?.id,
      };
    });

    const refundItems: BillDisplayItem[] = this.refunds().map(ref => ({
      id: ref.id,
      type: 'refund',
      date: ref.refundDate,
      description: ref.description,
      amount: ref.amount,
      refundId: ref.id,
    }));

    return [...installmentItems, ...refundItems]
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.cardId = Number(this.route.snapshot.paramMap.get('id'));
    this.billId = Number(this.route.snapshot.paramMap.get('billId'));
    this.loadPageData();
  }

  // ─── Carregamento ────────────────────────────────────────────────────────

  private loadPageData(): void {
    this.isLoading.set(true);

    this.compositionReady.set(false);
    this.purchaseInstallments.set({});
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
    }
    forkJoin({
      bill: this.creditCardService.getBill(this.cardId, this.billId),
      bills: this.creditCardService.getBills(this.cardId),
      purchases: this.creditCardService.getPurchases(this.cardId),
      statement: this.creditCardService.getBillStatement(this.cardId, this.billId),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ bill, bills, purchases, statement }) => {
        this.bill.set(bill);
        this.bills.set(bills);
        this.purchases.set(purchases);
        this.installments.set(statement.installments);
        this.refunds.set(statement.refunds);
        this.purchaseInstallments.set(Object.fromEntries(purchases.map(p => [p.id, p.installments])));
        this.compositionReady.set(true);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Não foi possível atualizar a composição. Atualize os dados antes de alterar a fatura.');
      },
    });
  }

  private findPurchaseForInstallment(inst: BillInstallmentItem): CreditCardPurchaseDto | undefined {
    return this.purchases().find(p => this.purchaseInstallments()[p.id]?.some(i => i.id === inst.id));
  }

  canDeletePurchase(purchaseId: number | undefined): boolean {
    if (!this.compositionReady() || this.isLoading() || purchaseId == null) return false;
    const installments = this.purchaseInstallments()[purchaseId];
    return !!installments && installments.every(i => this.bills().some(b => b.id === i.creditCardBillId && b.status === 'OPEN' && b.paymentId == null));
  }

  openMoveModal(item: BillDisplayItem): void {
    if (!this.canChangeComposition() || this.isSaving() || this.financialRecovery.state() !== 'clear' || item.purchaseId == null) return;
    const installment = this.purchaseInstallments()[item.purchaseId]?.find(i => i.id === item.id);
    if (!installment) return;
    this.selectedInstallment.set({ purchaseId: item.purchaseId, installment });
    this.moveForm.reset({ creditCardBillId: installment.creditCardBillId });
    this.errorMessage.set(null);
    this.activeModal.set('move-installment');
  }

  moveInstallment(): void {
    if (!this.canChangeComposition() || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    const selection = this.selectedInstallment();
    const destinationId = Number(this.moveForm.value.creditCardBillId);
    const current = selection && this.purchaseInstallments()[selection.purchaseId]?.find(i => i.id === selection.installment.id);
    if (!selection || !current || !this.openBills().some(b => b.id === current.creditCardBillId) || !this.openBills().some(b => b.id === destinationId)) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.financialRecovery.trackWrite({ label: 'Movimentação de parcela', pocketIds: [], cardId: this.cardId, billId: this.billId },
      this.creditCardService.updateInstallment(this.cardId, selection.purchaseId, selection.installment.id, {
        amount: current.amount,
        creditCardBillId: destinationId,
      })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeModal();
          this.loadPageData();
        },
        error: err => {
          this.isSaving.set(false);
          this.handleWriteError(err, 'Erro ao mover parcela.');
        },
      });
  }

  reopenBill(): void {
    if (this.bill()?.status !== 'CLOSED' || this.isLoading() || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.isSaving.set(true);
    this.financialRecovery.trackWrite({ label: 'Reabertura de fatura', pocketIds: [], cardId: this.cardId, billId: this.billId },
      this.creditCardService.reopenBill(this.cardId, this.billId)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { this.isSaving.set(false); this.loadPageData(); },
        error: err => { this.isSaving.set(false); this.handleWriteError(err, 'Erro ao reabrir fatura.'); },
      });
  }

  // ─── Criação de estorno ───────────────────────────────────────────────────

  openCreateRefundModal(): void {
    if (!this.canChangeComposition() || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.refundForm.reset({ refundDate: this.todayString() });
    this.refundForm.get('categoryId')!.setValue(this.reimbursementCategoryId());
    this.refundForm.get('categoryId')!.disable();
    this.errorMessage.set(null);
    this.activeModal.set('create-refund');
  }

  submitRefund(): void {
    if (!this.canChangeComposition()) return;
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    if (this.refundForm.invalid) {
      this.refundForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.refundForm.getRawValue();

    this.financialRecovery.trackWrite({ label: 'Alteração da composição da fatura', pocketIds: [], cardId: this.cardId, billId: this.billId }, this.creditCardService.createRefund(this.cardId, this.billId, {
      description: v.description!,
      amount: v.amount!,
      refundDate: v.refundDate!,
      categoryId: v.categoryId!,
    })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: refund => {
        this.refunds.update(list => [...list, refund]);
        this.refreshBill();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.handleWriteError(err, 'Erro ao criar estorno.');
      },
    });
  }

  // ─── Exclusão de compra ───────────────────────────────────────────────────

  openDeletePurchaseConfirm(purchaseId: number, description: string, totalInstallments: number): void {
    if (!this.canDeletePurchase(purchaseId) || this.isSaving()) return;
    this.selectedPurchaseId.set(purchaseId);
    this.selectedPurchaseDescription.set(description);
    this.selectedPurchaseTotalInstallments.set(totalInstallments);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete-purchase');
  }

  deletePurchase(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    const purchaseId = this.selectedPurchaseId();
    if (!purchaseId || !this.canDeletePurchase(purchaseId)) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.financialRecovery.trackWrite({ label: 'Alteração da composição da fatura', pocketIds: [], cardId: this.cardId, billId: this.billId }, this.creditCardService.deletePurchase(this.cardId, purchaseId)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.purchases.update(list => list.filter(p => p.id !== purchaseId));
        this.loadPageData();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.handleWriteError(err, 'Erro ao excluir compra.');
      },
    });
  }

  private refreshBill(): void {
    this.creditCardService.getBill(this.cardId, this.billId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: bill => this.bill.set(bill),
    });
  }

  // ─── Exclusão de estorno ──────────────────────────────────────────────────

  openDeleteRefundConfirm(refundId: number, description: string): void {
    if (!this.canChangeComposition() || this.isSaving()) return;
    this.selectedRefundId.set(refundId);
    this.selectedRefundDescription.set(description);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete-refund');
  }

  deleteRefund(): void {
    if (!this.canChangeComposition()) return;
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    const refundId = this.selectedRefundId();
    if (!refundId) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.financialRecovery.trackWrite({ label: 'Alteração da composição da fatura', pocketIds: [], cardId: this.cardId, billId: this.billId }, this.creditCardService.deleteRefund(this.cardId, this.billId, refundId)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.refunds.update(list => list.filter(r => r.id !== refundId));
        this.refreshBill();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.handleWriteError(err, 'Erro ao excluir estorno.');
      },
    });
  }

  private handleWriteError(error: any, fallback: string): void {
    this.errorMessage.set(financialWriteErrorMessage(error, fallback));
    if (error?.status === 409 || error?.status === 404 || isUncertainFinancialWrite(error)) this.loadPageData();
    if (isUncertainFinancialWrite(error)) {
      this.financialRecovery.mark({ label: 'Alteração da composição da fatura', pocketIds: [], cardId: this.cardId, billId: this.billId, message: financialWriteErrorMessage(error, fallback) });
      this.financialRecovery.check();
    }
  }

  // ─── Fechar modal genérico ────────────────────────────────────────────────

  closeModal(): void {
    if (this.isSaving()) return;
    this.selectedInstallment.set(null);
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedPurchaseId.set(null);
    this.selectedPurchaseDescription.set(null);
    this.selectedPurchaseTotalInstallments.set(null);
    this.selectedRefundId.set(null);
    this.selectedRefundDescription.set(null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private todayString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(date: string): string {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  }

  getBillStatusLabel(status: string): string {
    const labels: Record<string, string> = { OPEN: 'Aberta', CLOSED: 'Fechada', PAID: 'Paga' };
    return labels[status] ?? status;
  }

  get isPaid(): boolean {
    return this.bill()?.status === 'PAID';
  }
}
