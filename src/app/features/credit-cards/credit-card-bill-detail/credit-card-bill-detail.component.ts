import { Component, computed, inject, OnInit, signal, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, Subject, Subscription, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { centsDecimal, purchaseCents, purchaseDateValidator, purchaseMoneyValidator } from '../purchase-plan.util';

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
  purchaseId?: number | null;
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
  readonly refundReferencesReady = signal(false);
  readonly checkingRefundReferences = signal(false);
  readonly savedRefundBill = signal<CreditCardBillDto | null>(null);
  readonly canCreateRefund = computed(() => this.compositionReady() && !this.isLoading() && this.openBills().length > 0);
  private readonly cancelWrites = new Subject<void>();
  private pageRead?: Subscription;
  private refundReferencesRead?: Subscription;

  private readonly syncReviewedRefunds = effect(() => {
    const operation = this.financialRecovery.operation();
    if (this.financialRecovery.state() !== 'review' || operation?.cardId !== this.cardId || !operation.reviewRefunds) return;
    this.bills.set(this.financialRecovery.bills());
    const bill = this.financialRecovery.bills().find(b => b.id === this.billId);
    if (bill) this.bill.set(bill);
    if (operation.billId === this.billId && this.financialRecovery.refundStatement()) {
      this.installments.set(this.financialRecovery.refundStatement()!.installments);
      this.refunds.set(this.financialRecovery.refunds());
    }
  });

  // ─── Estado de exclusão ───────────────────────────────────────────────────

  readonly selectedPurchaseId = signal<number | null>(null);
  readonly selectedPurchaseDescription = signal<string | null>(null);
  readonly selectedPurchaseTotalInstallments = signal<number | null>(null);
  readonly selectedRefundId = signal<number | null>(null);
  readonly selectedRefundDescription = signal<string | null>(null);

  // ─── Formulários ─────────────────────────────────────────────────────────

  readonly refundForm = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(255), (c: AbstractControl) =>
      String(c.value ?? '').trim() ? null : { required: true }]],
    amount: ['' as string | number, [Validators.required, purchaseMoneyValidator]],
    refundDate: ['', [Validators.required, purchaseDateValidator]],
    categoryId: [null as number | null, Validators.required],
    creditCardBillId: [null as number | null, Validators.required],
    purchaseId: [null as number | null],
  });

  // ─── Categorias filtradas ─────────────────────────────────────────────────

  readonly refundCategories = computed(() => this.categoryService.categories()
    .filter(c => c.type === 'INCOME' || c.type === 'NEUTRAL')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));

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
      purchaseId: ref.purchaseId ?? null,
    }));

    return [...installmentItems, ...refundItems]
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly statementSections = computed(() => [
    { title: 'Parcelas', items: this.displayItems().filter(item => item.type === 'installment') },
    { title: 'Créditos de estorno', items: this.displayItems().filter(item => item.type === 'refund') },
  ].filter(section => section.items.length > 0));

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.cancelWrites.next();
      this.isSaving.set(false);
      this.cardId = Number(params.get('id'));
      this.billId = Number(params.get('billId'));
      this.bill.set(null);
      this.closeModal();
      this.savedRefundBill.set(null);
      this.loadPageData();
    });
  }

  // ─── Carregamento ────────────────────────────────────────────────────────

  private loadPageData(refundBillId?: number, confirmedRefund = false): void {
    this.pageRead?.unsubscribe();
    this.savedRefundBill.set(null);
    this.isLoading.set(true);

    this.compositionReady.set(false);
    this.purchaseInstallments.set({});
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
    }
    this.pageRead = forkJoin({
      bill: this.creditCardService.getBill(this.cardId, this.billId),
      bills: this.creditCardService.getBills(this.cardId),
      purchases: this.creditCardService.getPurchases(this.cardId),
      statement: this.creditCardService.getBillStatement(this.cardId, this.billId),
      refundBill: refundBillId && refundBillId !== this.billId ? this.creditCardService.getBill(this.cardId, refundBillId) : of(null),
      refundList: refundBillId ? this.creditCardService.getRefunds(this.cardId, refundBillId) : of(null),
      refundStatement: refundBillId && refundBillId !== this.billId ? this.creditCardService.getBillStatement(this.cardId, refundBillId) : of(null),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ bill, bills, purchases, statement, refundBill, refundList }) => {
        this.bill.set(bill);
        this.bills.set(bills);
        this.purchases.set(purchases);
        this.installments.set(statement.installments);
        this.refunds.set(refundBillId === this.billId && refundList ? refundList : statement.refunds);
        if (confirmedRefund) this.savedRefundBill.set(refundBill ?? bill);
        this.purchaseInstallments.set(Object.fromEntries(purchases.map(p => [p.id, p.installments])));
        this.compositionReady.set(true);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set(confirmedRefund
          ? 'Estorno registrado. Não foi possível atualizar todos os dados. Confira a fatura antes de registrar outro crédito.'
          : 'Não foi possível atualizar a composição. Atualize os dados antes de alterar a fatura.');
        if (refundBillId) {
          this.financialRecovery.mark({ label: 'Conferência dos estornos da fatura', pocketIds: [], cardId: this.cardId,
            billId: refundBillId, reviewRefunds: true, message: this.errorMessage()! });
          this.financialRecovery.check();
        }
      },
    });
  }

  private findPurchaseForInstallment(inst: BillInstallmentItem): CreditCardPurchaseDto | undefined {
    return this.purchases().find(p => this.purchaseInstallments()[p.id]?.some(i => i.id === inst.id));
  }

  canDeletePurchase(purchaseId: number | null | undefined): boolean {
    if (!this.compositionReady() || this.isLoading() || purchaseId == null) return false;
    if (this.refunds().some(refund => refund.purchaseId === purchaseId)) return false;
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
      })).pipe(takeUntil(this.cancelWrites), takeUntilDestroyed(this.destroyRef)).subscribe({
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
    if (this.bill()?.status !== 'CLOSED' || this.bill()?.paymentId != null || this.isLoading() || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.isSaving.set(true);
    this.financialRecovery.trackWrite({ label: 'Reabertura de fatura', pocketIds: [], cardId: this.cardId, billId: this.billId },
      this.creditCardService.reopenBill(this.cardId, this.billId)).pipe(takeUntil(this.cancelWrites), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { this.isSaving.set(false); this.loadPageData(); },
        error: err => { this.isSaving.set(false); this.handleWriteError(err, 'Erro ao reabrir fatura.'); },
      });
  }

  // ─── Criação de estorno ───────────────────────────────────────────────────

  openCreateRefundModal(): void {
    if (!this.canCreateRefund() || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.refundForm.reset({ amount: '', refundDate: this.todayString() });
    this.savedRefundBill.set(null);
    this.errorMessage.set(null);
    this.activeModal.set('create-refund');
    this.refreshRefundReferences();
  }

  refreshRefundReferences(): void {
    if (this.isSaving() || this.checkingRefundReferences()) return;
    this.refundReferencesReady.set(false);
    this.checkingRefundReferences.set(true);
    this.refundReferencesRead = forkJoin({ bills: this.creditCardService.getBills(this.cardId), purchases: this.creditCardService.getPurchases(this.cardId),
      categories: this.categoryService.loadCategories() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ bills, purchases }) => {
        this.bills.set(bills);
        this.purchases.set(purchases);
        this.refundReferencesReady.set(true);
        this.checkingRefundReferences.set(false);
      },
      error: () => {
        this.checkingRefundReferences.set(false);
        this.errorMessage.set('Não foi possível consultar faturas, compras e categorias. Atualize as opções antes de registrar.');
      },
    });
  }

  refundFieldError(field: string): string | null {
    const control = this.refundForm.get(field);
    if (!control?.touched || !control.invalid) return null;
    if (control.hasError('server')) return control.getError('server');
    if (control.hasError('required')) return 'Obrigatório.';
    if (field === 'amount') return 'Informe um valor positivo, até 9.999.999.999.999,99, com no máximo duas casas decimais.';
    if (field === 'refundDate') return 'Informe uma data válida.';
    return 'Informe uma descrição com até 255 caracteres.';
  }

  submitRefund(): void {
    if (!this.canCreateRefund() || !this.refundReferencesReady() || this.checkingRefundReferences() ||
        this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    if (this.refundForm.invalid) {
      this.refundForm.markAllAsTouched();
      return;
    }
    const v = this.refundForm.getRawValue();
    const destination = this.openBills().find(b => b.id === v.creditCardBillId);
    if (!destination || !this.refundCategories().some(c => c.id === v.categoryId) ||
        (v.purchaseId != null && !this.purchases().some(p => p.id === v.purchaseId))) {
      this.errorMessage.set('Selecione uma fatura aberta, uma categoria de receita ou neutra e, se houver referência, uma compra disponível neste cartão.');
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.financialRecovery.trackWrite({ label: 'Registro de estorno', pocketIds: [], cardId: this.cardId,
      billId: destination.id, reviewRefunds: true }, this.creditCardService.createRefund(this.cardId, destination.id, {
      description: v.description!.trim(),
      amount: Number(centsDecimal(purchaseCents(v.amount)!)),
      refundDate: v.refundDate!,
      categoryId: v.categoryId!,
      ...(v.purchaseId == null ? {} : { purchaseId: v.purchaseId }),
    })).pipe(takeUntil(this.cancelWrites), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeModal();
        this.loadPageData(destination.id, true);
      },
      error: err => {
        this.isSaving.set(false);
        if (err?.status === 400) this.applyRefundFieldErrors(err);
        this.handleWriteError(err, 'Erro ao criar estorno.', destination.id);
        if (err?.status === 404 || (err?.status === 400 && err?.error?.message?.includes('accumulated refunds'))) this.refreshRefundReferences();
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

    this.financialRecovery.trackWrite({ label: 'Alteração da composição da fatura', pocketIds: [], cardId: this.cardId, billId: this.billId }, this.creditCardService.deletePurchase(this.cardId, purchaseId)).pipe(takeUntil(this.cancelWrites), takeUntilDestroyed(this.destroyRef)).subscribe({
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

    this.financialRecovery.trackWrite({ label: 'Exclusão de estorno', pocketIds: [], cardId: this.cardId, billId: this.billId, reviewRefunds: true }, this.creditCardService.deleteRefund(this.cardId, this.billId, refundId)).pipe(takeUntil(this.cancelWrites), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeModal();
        this.loadPageData(this.billId);
      },
      error: err => {
        this.isSaving.set(false);
        this.handleWriteError(err, 'Erro ao excluir estorno.', this.billId);
      },
    });
  }

  private applyRefundFieldErrors(error: any): void {
    for (const item of Array.isArray(error.error?.errors) ? error.error.errors : []) {
      if (typeof item?.field !== 'string') continue;
      const control = this.refundForm.get(item?.field);
      if (!control) continue;
      const messages: Record<string, string> = {
        description: 'Informe uma descrição com até 255 caracteres.',
        amount: 'Informe um valor positivo, até 9.999.999.999.999,99, com no máximo duas casas decimais.',
        refundDate: 'Informe uma data válida.', categoryId: 'Selecione uma categoria disponível de receita ou neutra.',
        purchaseId: 'Selecione uma compra disponível neste cartão.',
      };
      control.setErrors({ server: messages[item.field] ?? 'Revise este campo.' });
      control.markAsTouched();
    }
  }

  private handleWriteError(error: any, fallback: string, refundBillId?: number): void {
    this.errorMessage.set(financialWriteErrorMessage(error, fallback));
    if (error?.status === 409 || error?.status === 404 || isUncertainFinancialWrite(error) ||
        error?.error?.message?.includes('accumulated refunds')) this.loadPageData(refundBillId);
    if (isUncertainFinancialWrite(error)) {
      this.financialRecovery.mark({ label: 'Alteração da composição da fatura', pocketIds: [], cardId: this.cardId,
        billId: refundBillId ?? this.billId, reviewRefunds: refundBillId != null, message: financialWriteErrorMessage(error, fallback) });
      this.financialRecovery.check();
    }
  }

  // ─── Fechar modal genérico ────────────────────────────────────────────────

  closeModal(): void {
    if (this.isSaving()) return;
    this.refundReferencesRead?.unsubscribe();
    this.checkingRefundReferences.set(false);
    this.refundReferencesReady.set(false);
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

  refreshPage(): void {
    if (this.isSaving() || this.isLoading()) return;
    this.errorMessage.set(null);
    this.loadPageData();
  }

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
