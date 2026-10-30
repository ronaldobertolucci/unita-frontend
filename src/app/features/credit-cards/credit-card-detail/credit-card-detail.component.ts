import { financialWriteErrorMessage, isUncertainFinancialWrite } from '../../../core/utils/financial-operation.util';
import { FinancialRecoveryService } from '../../../core/services/financial-recovery.service';
import { FinancialRecoveryComponent } from '../../../shared/financial-recovery/financial-recovery.component';
import { Component, OnInit, inject, signal, computed, effect, untracked, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, finalize, Observable, tap, of, catchError, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';

import { CreditCardService } from '../../../core/services/credit-card.service';
import { PocketService } from '../../../core/services/pocket.service';
import { CategoryService } from '../../../core/services/category.service';
import { CreditCardDto, CreditCardBillDto, BillStatus, CreditCardPurchaseDto, CreatePurchasePayload } from '../../../core/models/credit-card.model';
import { PocketSummaryDto } from '../../../core/models/pocket.model';
import { automaticPurchaseAmounts, centsDecimal, installmentCountValidator, purchaseCents,
  purchaseDateValidator, purchaseFieldError, purchaseMoneyValidator, purchasePlanError } from '../purchase-plan.util';

type ModalType = 'pay-bill' | 'purchase-form' | 'purchase-detail' | null;

@Component({
  selector: 'app-credit-card-detail',
  standalone: true,
  imports: [FinancialRecoveryComponent, CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-card-detail.component.html',
  styleUrl: './credit-card-detail.component.css',
})
export class CreditCardDetailComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly financialRecovery = inject(FinancialRecoveryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly creditCardService = inject(CreditCardService);
  private readonly pocketService = inject(PocketService);
  private readonly categoryService = inject(CategoryService);

  private cardId!: number;

  private readonly syncReviewedBills = effect(() => {
    if (this.financialRecovery.operation()?.cardId === this.cardId && this.financialRecovery.state() === 'review') {
      this.bills.set(this.financialRecovery.bills());
      if (this.financialRecovery.operation()?.reviewPurchases) {
        const list = this.financialRecovery.purchases();
        const id = untracked(() => this.currentPurchase()?.id);
        this.purchases.set(list);
        this.currentPurchase.set(list.find(p => p.id === id) ?? null);
      }
    }
  });

  // ─── Estado ──────────────────────────────────────────────────────────────

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly activeModal = signal<ModalType>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly inlineError = signal<{ billId: number; message: string } | null>(null);

  readonly card = signal<CreditCardDto | null>(null);
  readonly bills = signal<CreditCardBillDto[]>([]);
  readonly selectedBill = signal<CreditCardBillDto | null>(null);

  readonly paidBillsVisible = signal(false);

  readonly activeBills = computed(() =>
    this.bills()
      .filter(b => b.status !== 'PAID')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  );

  readonly paidBills = computed(() =>
    this.bills()
      .filter(b => b.status === 'PAID')
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  );

  readonly purchases = signal<CreditCardPurchaseDto[]>([]);
  private readonly defaultPurchasePeriod = this.last30Days();
  readonly purchaseFilterForm = this.fb.nonNullable.group(this.defaultPurchasePeriod);
  readonly purchaseFilterError = signal<string | null>(null);
  readonly appliedPurchasePeriod = signal(this.defaultPurchasePeriod);
  readonly isLoadingPurchases = signal(false);
  private purchaseRequestVersion = 0;
  readonly visiblePurchases = computed(() => {
    const { startDate, endDate } = this.appliedPurchasePeriod();
    return this.purchases().filter(p => (!startDate || p.purchaseDate >= startDate) &&
      (!endDate || p.purchaseDate <= endDate));
  });
  readonly purchasesError = signal<string | null>(null);
  readonly checkingComposition = signal(false);
  readonly currentPurchase = signal<CreditCardPurchaseDto | null>(null);
  readonly editingPurchaseId = signal<number | null>(null);
  readonly ownedCardAvailable = signal(false);
  readonly fieldErrors = signal<Record<string, string>>({});
  private readonly formRevision = signal(0);

  readonly payForm = this.fb.group({ pocketId: [null as number | null, Validators.required] });
  get payPocketId() { return this.payForm.get('pocketId')!; }

  readonly installmentRows = this.fb.array<ReturnType<CreditCardDetailComponent['newInstallmentRow']>>([]);
  readonly purchaseForm = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(255), (c: AbstractControl) =>
      String(c.value ?? '').trim() ? null : { required: true }]],
    totalValue: ['', [Validators.required, purchaseMoneyValidator]],
    purchaseDate: ['', [Validators.required, purchaseDateValidator]],
    installmentsCount: [1, [Validators.required, installmentCountValidator]],
    categoryId: [null as number | null, Validators.required],
    installmentMode: ['AUTOMATIC' as 'AUTOMATIC' | 'CUSTOM', Validators.required],
    installments: this.installmentRows,
  });

  readonly expenseCategories = computed(() => this.categoryService.categories()
    .filter(c => c.type === 'EXPENSE' || c.type === 'NEUTRAL')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));

  readonly planError = computed(() => {
    this.formRevision();
    const v = this.purchaseForm.getRawValue();
    return purchasePlanError(v.totalValue, v.installmentsCount ?? 0, v.installmentMode ?? '', v.installments);
  });

  readonly automaticAmounts = computed(() => {
    this.formRevision();
    return automaticPurchaseAmounts(purchaseCents(this.purchaseForm.value.totalValue) ?? 0,
      this.purchaseForm.value.installmentsCount ?? 0);
  });

  readonly canEditPurchase = computed(() => {
    const purchase = this.currentPurchase();
    return !!purchase && purchase.installments.every(i => this.bills().some(b =>
      b.id === i.creditCardBillId && b.status === 'OPEN' && b.paymentId == null));
  });

  constructor() {
    this.purchaseForm.controls.installmentsCount.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncInstallmentRows());
    this.purchaseForm.controls.installmentMode.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncInstallmentRows());
    this.purchaseForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formRevision.update(v => v + 1);
      this.fieldErrors.set({});
    });
  }

  private newInstallmentRow(amount = '', categoryId: number | null = null) {
    return this.fb.group({ amount: [amount, [Validators.required, purchaseMoneyValidator]], categoryId: [categoryId] });
  }

  private syncInstallmentRows(): void {
    const count = this.purchaseForm.controls.installmentsCount.value;
    if (!Number.isInteger(count) || count! < 1 || count! > 120) return;
    const automatic = automaticPurchaseAmounts(purchaseCents(this.purchaseForm.controls.totalValue.value) ?? 0, count!);
    while (this.installmentRows.length > count!) this.installmentRows.removeAt(this.installmentRows.length - 1, { emitEvent: false });
    while (this.installmentRows.length < count!) {
      const cents = automatic[this.installmentRows.length];
      this.installmentRows.push(this.newInstallmentRow(!this.editingPurchaseId() && cents ? centsDecimal(cents) : ''), { emitEvent: false });
    }
    if (!this.editingPurchaseId() && this.purchaseForm.controls.installmentMode.value === 'CUSTOM') {
      this.installmentRows.controls.forEach((row, index) => {
        if (!row.controls.amount.value && !row.controls.amount.dirty && automatic[index]) {
          row.controls.amount.setValue(centsDecimal(automatic[index]), { emitEvent: false });
        }
      });
    }
    this.formRevision.update(v => v + 1);
  }

  controlError(field: string, control: AbstractControl | null = this.purchaseForm.get(field)): string | null {
    const server = this.fieldErrors()[field];
    if (server) return server;
    return control?.invalid && control.touched ? purchaseFieldError(field, control.hasError('required') ? 'must not be null' : '') : null;
  }

  // ─── Totais ───────────────────────────────────────────────────────────────

  readonly totalOpenBills = computed(() =>
    this.activeBills().reduce((sum, b) => sum + b.totalAmount, 0)
  );

  readonly eligiblePockets = computed<PocketSummaryDto[]>(() =>
    this.pocketService.pockets().filter(p =>
      p.type === 'BANK_ACCOUNT' || p.type === 'CASH'
    )
  );

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.cardId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadPageData();
  }

  // ─── Carregamento ────────────────────────────────────────────────────────

  private loadPageData(): void {
    this.isLoading.set(true);

    this.creditCardService.getCreditCard(this.cardId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: card => {
        this.card.set(card);
        this.loadBills();
        this.loadPurchases();
      },
      error: () => this.router.navigate(['/credit-cards']),
    });

    if (this.pocketService.pockets().length === 0) {
      this.pocketService.loadPockets().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }

    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} });
    }
  }

  private loadBills(): void {
    this.creditCardService.getBills(this.cardId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: bills => {
        this.bills.set(bills);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Ações de fatura ─────────────────────────────────────────────────────

  closeBill(bill: CreditCardBillDto): void {
    if (bill.status !== 'OPEN' || bill.paymentId != null) return;
    this.changeBillState(bill, () => this.creditCardService.closeBill(this.cardId, bill.id));
  }

  reopenBill(bill: CreditCardBillDto): void {
    if (bill.status !== 'CLOSED' || bill.paymentId != null) return;
    this.changeBillState(bill, () => this.creditCardService.reopenBill(this.cardId, bill.id));
  }

  private changeBillState(bill: CreditCardBillDto, request: () => Observable<CreditCardBillDto>): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.isSaving.set(true);
    this.inlineError.set(null);
    const operation = { label: `Alteração da fatura com vencimento em ${this.formatDate(bill.dueDate)}`, pocketIds: [], cardId: this.cardId, billId: bill.id };
    this.financialRecovery.trackWrite(operation, request()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { this.replaceBill(updated); this.loadBills(); this.isSaving.set(false); },
      error: err => {
        this.inlineError.set({ billId: bill.id, message: financialWriteErrorMessage(err, 'Erro ao alterar fatura.') });
        if (isUncertainFinancialWrite(err)) {
          this.financialRecovery.mark({ ...operation, message: financialWriteErrorMessage(err, 'Erro ao alterar fatura.') });
          this.financialRecovery.check();
        }
        this.refreshBillState(bill.id).pipe(finalize(() => this.isSaving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
          error: () => {
            if (this.financialRecovery.state() === 'clear') {
              this.financialRecovery.mark({ ...operation, message: 'Não foi possível atualizar a fatura após a rejeição. Consulte o estado atual antes de enviar novamente.' });
            }
          },
        });
      },
    });
  }

  canPay(bill: CreditCardBillDto | null): boolean {
    return bill?.status === 'CLOSED' && bill.paymentId == null && bill.totalAmount > 0;
  }

  private refreshBillState(billId: number): Observable<unknown> {
    return forkJoin({ bill: this.creditCardService.getBill(this.cardId, billId), bills: this.creditCardService.getBills(this.cardId) }).pipe(
      tap(({ bill, bills }) => {
        this.bills.set([...bills.filter(item => item.id !== bill.id), bill]);
        if (this.selectedBill()?.id === billId) this.selectedBill.set(bill);
      }),
    );
  }

  openPayModal(bill: CreditCardBillDto): void {
    if (!this.canPay(bill) || this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    this.selectedBill.set(bill);
    this.payForm.reset();
    this.errorMessage.set(null);
    this.activeModal.set('pay-bill');
  }

  payBill(): void {
    if (this.isSaving() || this.financialRecovery.state() !== 'clear') return;
    if (this.payForm.invalid) {
      this.payForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const bill = this.selectedBill();
    if (!bill || !this.canPay(bill)) { this.isSaving.set(false); return; }
    const pocketId = Number(this.payForm.value.pocketId);
    if (!this.eligiblePockets().some(pocket => pocket.id === pocketId)) {
      this.isSaving.set(false);
      this.errorMessage.set('Selecione uma conta própria disponível para pagamento.');
      return;
    }

    this.financialRecovery.trackWrite({ label: `Pagamento da fatura com vencimento em ${this.formatDate(bill.dueDate)}`, pocketIds: [pocketId], cardId: this.cardId, billId: bill.id }, this.creditCardService.payBill(this.cardId, bill.id, {
      pocketId,
    })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.replaceBill(updated);
        this.activeModal.set(null);
        this.errorMessage.set(null);
        forkJoin({ bill: this.refreshBillState(bill.id), pockets: this.financialRecovery.refreshPockets([pocketId]) })
          .pipe(finalize(() => this.isSaving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
            error: () => {
              this.financialRecovery.mark({ label: 'Atualização após pagamento de fatura', pocketIds: [pocketId], cardId: this.cardId, billId: bill.id, message: 'Fatura paga. Não foi possível atualizar todos os dados. Confira a fatura, o saldo e o extrato antes de uma nova operação.' });
              this.financialRecovery.check();
            },
          });
      },
      error: err => {
        const message = financialWriteErrorMessage(err, 'Erro ao pagar fatura.');
        if (isUncertainFinancialWrite(err)) {
          this.isSaving.set(false);
          this.closeModal();
          this.financialRecovery.mark({ label: `Pagamento da fatura com vencimento em ${this.formatDate(bill.dueDate)}`, pocketIds: [pocketId], cardId: this.cardId, billId: bill.id, message });
          this.financialRecovery.check();
        } else {
          this.errorMessage.set(message);
          forkJoin({ bill: this.refreshBillState(bill.id), pockets: this.financialRecovery.refreshPockets([pocketId]) })
            .pipe(finalize(() => this.isSaving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
              error: () => this.financialRecovery.mark({ label: 'Conferência após pagamento rejeitado', pocketIds: [pocketId], cardId: this.cardId, billId: bill.id, message: 'A operação foi rejeitada, mas não foi possível atualizar todos os dados. Consulte o estado atual antes de enviar novamente.' }),
            });
          if (err.status === 404) this.payForm.reset();
        }
      },
    });
  }

  // ─── Compra com plano integral ───────────────────────────────────────────

  applyPurchaseFilter(): void {
    const period = this.purchaseFilterForm.getRawValue();
    if (period.startDate && period.endDate && period.startDate > period.endDate) {
      this.purchaseFilterError.set('A data inicial deve ser anterior ou igual à data final.');
      return;
    }
    this.purchaseFilterError.set(null);
    this.appliedPurchasePeriod.set(period);
    this.loadPurchases();
  }

  resetPurchaseFilter(): void {
    this.purchaseFilterForm.setValue(this.last30Days());
    this.applyPurchaseFilter();
  }

  private loadPurchases(): void {
    const version = ++this.purchaseRequestVersion;
    const { startDate, endDate } = this.appliedPurchasePeriod();
    this.isLoadingPurchases.set(true);
    this.purchasesError.set(null);
    this.creditCardService.getPurchases(this.cardId, startDate || undefined, endDate || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
        if (version === this.purchaseRequestVersion) this.isLoadingPurchases.set(false);
      })).subscribe({
        next: list => { if (version === this.purchaseRequestVersion) this.purchases.set(list); },
        error: () => {
          if (version !== this.purchaseRequestVersion) return;
          this.purchases.set([]);
          this.purchasesError.set('Não foi possível consultar as compras. Atualize o histórico.');
        },
      });
  }

  refreshPurchaseHistory(): void {
    if (this.isSaving() || this.checkingComposition()) return;
    this.loadPurchases();
    this.loadBills();
  }

  private refreshPurchaseReferences(): void {
    this.checkingComposition.set(true);
    this.ownedCardAvailable.set(false);
    forkJoin({ cards: this.creditCardService.loadCreditCards(), categories: this.categoryService.loadCategories() })
      .pipe(finalize(() => this.checkingComposition.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ cards }) => {
          this.ownedCardAvailable.set(cards.some(c => c.id === this.cardId));
          if (!this.ownedCardAvailable()) this.errorMessage.set('Cartão indisponível. Atualize a seleção.');
        },
        error: () => this.errorMessage.set('Não foi possível atualizar cartões e categorias. Reabra o formulário para tentar consultar novamente.'),
      });
  }

  openCreatePurchaseModal(): void {
    if (this.isSaving() || this.checkingComposition() || this.financialRecovery.state() !== 'clear') return;
    this.currentPurchase.set(null);
    this.editingPurchaseId.set(null);
    this.installmentRows.clear({ emitEvent: false });
    this.purchaseForm.reset({ description: '', totalValue: '', purchaseDate: this.todayString(),
      installmentsCount: 1, categoryId: null, installmentMode: 'AUTOMATIC' });
    this.fieldErrors.set({});
    this.errorMessage.set(null);
    this.activeModal.set('purchase-form');
    this.refreshPurchaseReferences();
  }

  openPurchaseDetail(purchase: CreditCardPurchaseDto): void {
    if (this.isSaving() || this.checkingComposition()) return;
    this.currentPurchase.set(null);
    this.errorMessage.set(null);
    this.activeModal.set('purchase-detail');
    this.checkingComposition.set(true);
    forkJoin({ purchase: this.creditCardService.getPurchase(this.cardId, purchase.id), bills: this.creditCardService.getBills(this.cardId) })
      .pipe(finalize(() => this.checkingComposition.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => { this.currentPurchase.set(data.purchase); this.bills.set(data.bills); this.replacePurchase(data.purchase); },
        error: err => { this.errorMessage.set(financialWriteErrorMessage(err, 'Não foi possível consultar a compra.')); this.loadPurchases(); },
      });
  }

  openEditPurchaseModal(): void {
    const purchase = this.currentPurchase();
    if (!purchase || !this.canEditPurchase() || this.isSaving() || this.checkingComposition() || this.financialRecovery.state() !== 'clear') return;
    // Read again just before editing; eligibility is still checked by the server on PUT.
    this.checkingComposition.set(true);
    forkJoin({ purchase: this.creditCardService.getPurchase(this.cardId, purchase.id), bills: this.creditCardService.getBills(this.cardId),
      cards: this.creditCardService.loadCreditCards(), categories: this.categoryService.loadCategories() })
      .pipe(finalize(() => this.checkingComposition.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => {
          this.currentPurchase.set(data.purchase);
          this.bills.set(data.bills);
          this.ownedCardAvailable.set(data.cards.some(c => c.id === this.cardId));
          if (!this.ownedCardAvailable()) { this.errorMessage.set('Cartão indisponível. Atualize a seleção.'); return; }
          if (!this.canEditPurchase()) { this.errorMessage.set('Esta compra contém parcelas em faturas protegidas. Confira as faturas antes de corrigir.'); return; }
          this.preparePurchaseEdit(data.purchase);
        },
        error: err => this.errorMessage.set(financialWriteErrorMessage(err, 'Não foi possível atualizar a compra.')),
      });
  }

  private preparePurchaseEdit(purchase: CreditCardPurchaseDto): void {
    this.editingPurchaseId.set(purchase.id);
    this.installmentRows.clear({ emitEvent: false });
    this.purchaseForm.reset({ description: purchase.description, totalValue: String(purchase.totalValue),
      purchaseDate: purchase.purchaseDate, installmentsCount: purchase.installmentsCount,
      categoryId: purchase.installments[0]?.category.id ?? null, installmentMode: 'CUSTOM' }, { emitEvent: false });
    // Missing legacy rows stay blank: the user must explicitly provide the complete plan.
    for (let number = 1; number <= Math.min(120, purchase.installmentsCount); number++) {
      const installment = purchase.installments.find(i => i.installmentNumber === number);
      this.installmentRows.push(this.newInstallmentRow(installment ? String(installment.amount) : '', installment?.category.id ?? null), { emitEvent: false });
    }
    this.purchaseForm.markAsPristine();
    this.purchaseForm.markAsUntouched();
    this.formRevision.update(v => v + 1);
    this.fieldErrors.set({});
    this.errorMessage.set(null);
    this.activeModal.set('purchase-form');
  }

  submitPurchase(): void {
    if (this.isSaving() || this.checkingComposition() || this.financialRecovery.state() !== 'clear' || !this.ownedCardAvailable()) return;
    if (this.editingPurchaseId() !== null && !this.canEditPurchase()) return;
    const v = this.purchaseForm.getRawValue();
    this.purchaseForm.markAllAsTouched();
    const custom = v.installmentMode === 'CUSTOM';
    const mainInvalid = ['description', 'totalValue', 'purchaseDate', 'installmentsCount', 'categoryId', 'installmentMode']
      .some(field => this.purchaseForm.get(field)!.invalid);
    if (mainInvalid || (custom && this.installmentRows.invalid) || this.planError()) return;
    const availableCategory = (id: number | null) => this.expenseCategories().some(c => c.id === id);
    if (!availableCategory(v.categoryId) || (custom && v.installments.some(i => i.categoryId != null && !availableCategory(i.categoryId)))) {
      this.errorMessage.set('Selecione categorias disponíveis de despesa ou neutras para todo o plano.');
      return;
    }
    const payload: CreatePurchasePayload = {
      description: v.description!.trim(), totalValue: Number(centsDecimal(purchaseCents(v.totalValue)!)),
      purchaseDate: v.purchaseDate!, installmentsCount: v.installmentsCount!, categoryId: v.categoryId!,
      installmentMode: v.installmentMode!,
      ...(custom ? { installments: v.installments.map((row, index) => ({ installmentNumber: index + 1,
        amount: Number(centsDecimal(purchaseCents(row.amount)!)), ...(row.categoryId == null ? {} : { categoryId: row.categoryId }) })) } : {}),
    };
    const id = this.editingPurchaseId();
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});
    const operation = { label: id ? 'Correção integral da compra' : 'Criação da compra completa', pocketIds: [],
      cardId: this.cardId, reviewPurchases: true, ...(id ? { purchaseId: id } : {}) };
    const request = id ? this.creditCardService.updatePurchase(this.cardId, id, payload) : this.creditCardService.createPurchase(this.cardId, payload);
    this.financialRecovery.trackWrite(operation, request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: purchase => {
        this.currentPurchase.set(purchase);
        this.replacePurchase(purchase);
        this.editingPurchaseId.set(null);
        this.activeModal.set('purchase-detail');
        this.isSaving.set(false);
        this.refreshPurchaseHistory();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(financialWriteErrorMessage(err, 'Erro ao salvar a compra.'));
        if (err?.status === 400) this.applyPurchaseFieldErrors(err);
        if (isUncertainFinancialWrite(err)) {
          this.financialRecovery.mark({ ...operation, message: financialWriteErrorMessage(err, 'Erro ao salvar a compra.') });
          this.financialRecovery.check();
        } else if (err?.status === 409 || err?.status === 404) {
          this.reloadRejectedPurchase(id, err.status === 404);
        }
      },
    });
  }

  private reloadRejectedPurchase(id: number | null, refreshReferences: boolean): void {
    this.checkingComposition.set(true);
    forkJoin({ bills: this.creditCardService.getBills(this.cardId), purchases: this.creditCardService.getPurchases(this.cardId),
      purchase: id ? this.creditCardService.getPurchase(this.cardId, id).pipe(catchError(error =>
        error.status === 404 ? of(null) : throwError(() => error))) : of(null),
      cards: refreshReferences ? this.creditCardService.loadCreditCards() : of(null),
      categories: refreshReferences ? this.categoryService.loadCategories() : of(null) })
      .pipe(finalize(() => this.checkingComposition.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ bills, purchases, purchase, cards }) => {
          this.bills.set(bills);
          this.purchases.set(purchases);
          if (id) this.currentPurchase.set(purchase);
          if (purchase) this.replacePurchase(purchase);
          if (cards) this.ownedCardAvailable.set(cards.some(c => c.id === this.cardId));
        },
        error: () => {
          this.financialRecovery.mark({ label: 'Conferência após compra rejeitada', pocketIds: [], cardId: this.cardId,
            reviewPurchases: true, ...(id ? { purchaseId: id } : {}),
            message: 'Não foi possível atualizar compras e faturas. Consulte o estado atual antes de enviar novamente.' });
          this.financialRecovery.check();
        },
      });
  }

  private applyPurchaseFieldErrors(error: any): void {
    const fields: Record<string, string> = {};
    const errors = Array.isArray(error.error?.errors) ? error.error.errors : [];
    const details = Array.isArray(error.error?.details) ? error.error.details : [];
    for (const item of [...errors, ...details.map((detail: string) => {
      const separator = typeof detail === 'string' ? detail.indexOf(':') : -1;
      return separator < 0 ? null : { field: detail.slice(0, separator), message: detail.slice(separator + 1).trim() };
    })]) {
      if (typeof item?.field === 'string' && typeof item?.message === 'string') fields[item.field] = purchaseFieldError(item.field, item.message);
    }
    this.fieldErrors.set(fields);
  }

  private replacePurchase(purchase: CreditCardPurchaseDto): void {
    this.purchases.update(list => list.some(p => p.id === purchase.id)
      ? list.map(p => p.id === purchase.id ? purchase : p)
      : [purchase, ...list]);
  }

  sortedInstallments(purchase: CreditCardPurchaseDto) {
    return [...purchase.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  }

  isIncompletePurchase(purchase: CreditCardPurchaseDto): boolean {
    const rows = this.sortedInstallments(purchase);
    return purchaseCents(purchase.totalValue) === null || !Number.isInteger(purchase.installmentsCount) ||
      purchase.installmentsCount < 1 || purchase.installmentsCount > 120 ||
      rows.length !== purchase.installmentsCount || rows.some((i, index) => i.installmentNumber !== index + 1) ||
      purchasePlanError(purchase.totalValue, purchase.installmentsCount, 'CUSTOM', rows) !== null;
  }

  // ─── Fechar modal ─────────────────────────────────────────────────────────

  closeModal(): void {
    if (this.isSaving() || this.checkingComposition()) return;
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedBill.set(null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private replaceBill(updated: CreditCardBillDto): void {
    this.bills.update(list => list.map(b => b.id === updated.id ? updated : b));
  }

  private last30Days(): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return { startDate: this.dateString(start), endDate: this.dateString(end) };
  }

  private todayString(): string {
    return this.dateString(new Date());
  }

  private dateString(d: Date): string {
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

  getBillStatusLabel(status: BillStatus): string {
    const labels: Record<BillStatus, string> = {
      OPEN: 'Aberta',
      CLOSED: 'Fechada',
      PAID: 'Paga',
    };
    return labels[status];
  }
}
