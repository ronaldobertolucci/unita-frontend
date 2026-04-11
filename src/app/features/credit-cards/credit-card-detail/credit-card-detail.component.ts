import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CreditCardService } from '../../../core/services/credit-card.service';
import { PocketService } from '../../../core/services/pocket.service';
import { CategoryService } from '../../../core/services/category.service';
import { translateApiError } from '../../../core/utils/api-error.util';
import { CreditCardDto, CreditCardBillDto, BillStatus, CreditCardPurchaseDto } from '../../../core/models/credit-card.model';
import { PocketSummaryDto } from '../../../core/models/pocket.model';

type ModalType =
  | 'pay-bill'
  | 'create-purchase-step1'
  | 'create-purchase-step2'
  | 'warn-close-mid-purchase'
  | null;

@Component({
  selector: 'app-credit-card-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-card-detail.component.html',
  styleUrl: './credit-card-detail.component.css',
})
export class CreditCardDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly creditCardService = inject(CreditCardService);
  private readonly pocketService = inject(PocketService);
  private readonly categoryService = inject(CategoryService);

  private cardId!: number;

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

  // ─── Estado do fluxo de criação de compra ────────────────────────────────

  readonly currentPurchase = signal<CreditCardPurchaseDto | null>(null);
  readonly currentInstallmentIndex = signal(1);

  // ─── Formulários ─────────────────────────────────────────────────────────

  readonly payForm = this.fb.group({
    pocketId: [null as number | null, Validators.required],
  });

  get payPocketId() { return this.payForm.get('pocketId')!; }

  readonly purchaseStep1Form = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(255)]],
    totalValue: [null as number | null, [Validators.required, Validators.min(0.01)]],
    purchaseDate: ['', Validators.required],
    installmentsCount: [null as number | null, [Validators.required, Validators.min(1), Validators.max(99)]],
  });

  readonly installmentForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    categoryId: [null as number | null, Validators.required],
  });

  get s1Description() { return this.purchaseStep1Form.get('description')!; }
  get s1TotalValue() { return this.purchaseStep1Form.get('totalValue')!; }
  get s1PurchaseDate() { return this.purchaseStep1Form.get('purchaseDate')!; }
  get s1InstallmentsCount() { return this.purchaseStep1Form.get('installmentsCount')!; }
  get instAmount() { return this.installmentForm.get('amount')!; }
  get instCategoryId() { return this.installmentForm.get('categoryId')!; }

  // ─── Categorias para parcelas ─────────────────────────────────────────────

readonly expenseCategories = computed(() =>
  this.categoryService.categories()
    .filter(c => c.type === 'EXPENSE')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
);

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

    this.creditCardService.getCreditCard(this.cardId).subscribe({
      next: card => {
        this.card.set(card);
        this.loadBills();
      },
      error: () => this.router.navigate(['/credit-cards']),
    });

    if (this.pocketService.pockets().length === 0) {
      this.pocketService.loadPockets().subscribe();
    }

    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories().subscribe();
    }
  }

  private loadBills(): void {
    this.creditCardService.getBills(this.cardId).subscribe({
      next: bills => {
        this.bills.set(bills);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  // ─── Ações de fatura ─────────────────────────────────────────────────────

  closeBill(bill: CreditCardBillDto): void {
    this.inlineError.set(null);
    this.creditCardService.closeBill(this.cardId, bill.id).subscribe({
      next: updated => this.replaceBill(updated),
      error: err => this.inlineError.set({
        billId: bill.id,
        message: translateApiError(err?.error?.message, 'Erro ao fechar fatura.'),
      }),
    });
  }

  reopenBill(bill: CreditCardBillDto): void {
    this.inlineError.set(null);
    this.creditCardService.reopenBill(this.cardId, bill.id).subscribe({
      next: updated => this.replaceBill(updated),
      error: err => this.inlineError.set({
        billId: bill.id,
        message: translateApiError(err?.error?.message, 'Erro ao reabrir fatura.'),
      }),
    });
  }

  openPayModal(bill: CreditCardBillDto): void {
    this.selectedBill.set(bill);
    this.payForm.reset();
    this.errorMessage.set(null);
    this.activeModal.set('pay-bill');
  }

  payBill(): void {
    if (this.payForm.invalid) {
      this.payForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const bill = this.selectedBill()!;

    this.creditCardService.payBill(this.cardId, bill.id, {
      pocketId: this.payForm.value.pocketId!,
    }).subscribe({
      next: updated => {
        this.replaceBill(updated);
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao pagar fatura.'));
      },
    });
  }

  // ─── Criação de compra ────────────────────────────────────────────────────

  openCreatePurchaseModal(): void {
    this.purchaseStep1Form.reset({ purchaseDate: this.todayString() });
    this.errorMessage.set(null);
    this.activeModal.set('create-purchase-step1');
  }

  submitPurchaseStep1(): void {
    if (this.purchaseStep1Form.invalid) {
      this.purchaseStep1Form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.purchaseStep1Form.value;

    this.creditCardService.createPurchase(this.cardId, {
      description: v.description!,
      totalValue: v.totalValue!,
      purchaseDate: v.purchaseDate!,
      installmentsCount: v.installmentsCount!,
    }).subscribe({
      next: purchase => {
        this.currentPurchase.set(purchase);
        this.currentInstallmentIndex.set(1);
        const suggestedAmount = +(v.totalValue! / v.installmentsCount!).toFixed(2);
        this.installmentForm.reset({ amount: suggestedAmount, categoryId: null });
        this.isSaving.set(false);
        this.activeModal.set('create-purchase-step2');
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar compra.'));
      },
    });
  }

  submitInstallment(): void {
    if (this.installmentForm.invalid) {
      this.installmentForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const purchase = this.currentPurchase()!;
    const index = this.currentInstallmentIndex();
    const v = this.installmentForm.value;

    this.creditCardService.createInstallment(this.cardId, purchase.id, {
      installmentNumber: index,
      amount: v.amount!,
      categoryId: v.categoryId!,
    }).subscribe({
      next: () => {
        this.isSaving.set(false);
        const isLast = index === purchase.installmentsCount;
        if (isLast) {
          this.loadBills();
          this.closeModal();
        } else {
          this.currentInstallmentIndex.set(index + 1);
          const remaining = purchase.totalValue - (v.amount! * index);
          const remainingInstallments = purchase.installmentsCount - index;
          const suggested = +(remaining / remainingInstallments).toFixed(2);
          this.installmentForm.patchValue({ amount: suggested > 0 ? suggested : null });
        }
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar parcela.'));
      },
    });
  }

  tryCloseStep2(): void {
    this.activeModal.set('warn-close-mid-purchase');
  }

  confirmCloseStep2(): void {
    this.loadBills();
    this.currentPurchase.set(null);
    this.currentInstallmentIndex.set(1);
    this.activeModal.set(null);
    this.errorMessage.set(null);
  }

  cancelCloseStep2(): void {
    this.activeModal.set('create-purchase-step2');
  }

  deletePurchaseFromStep2(): void {
    const purchase = this.currentPurchase();
    if (!purchase) return;
    this.isSaving.set(true);
    this.creditCardService.deletePurchase(this.cardId, purchase.id).subscribe({
      next: () => {
        this.loadBills();
        this.currentPurchase.set(null);
        this.currentInstallmentIndex.set(1);
        this.isSaving.set(false);
        this.activeModal.set(null);
        this.errorMessage.set(null);
      },
      error: () => {
        this.isSaving.set(false);
        this.activeModal.set('create-purchase-step2');
      },
    });
  }

  // ─── Fechar modal ─────────────────────────────────────────────────────────

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
    this.selectedBill.set(null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private replaceBill(updated: CreditCardBillDto): void {
    this.bills.update(list => list.map(b => b.id === updated.id ? updated : b));
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

  getBillStatusLabel(status: BillStatus): string {
    const labels: Record<BillStatus, string> = {
      OPEN: 'Aberta',
      CLOSED: 'Fechada',
      PAID: 'Paga',
    };
    return labels[status];
  }
}