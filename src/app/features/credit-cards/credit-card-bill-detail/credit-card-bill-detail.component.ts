import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CreditCardService } from '../../../core/services/credit-card.service';
import { CategoryService } from '../../../core/services/category.service';
import { translateApiError } from '../../../core/utils/api-error.util';
import {
  CreditCardBillDto,
  BillInstallmentItem,
  BillRefundItem,
  CreditCardPurchaseDto,
} from '../../../core/models/credit-card.model';

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type ModalType =
  | 'create-refund'
  | 'confirm-delete-purchase'
  | 'confirm-delete-refund'
  | null;

/** Item unificado para exibição na lista da fatura */
interface BillDisplayItem {
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
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-card-bill-detail.component.html',
  styleUrl: './credit-card-bill-detail.component.css',
})
export class CreditCardBillDetailComponent implements OnInit {
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

  readonly incomeCategories = computed(() =>
    this.categoryService.categories().filter(c => c.type === 'INCOME' || c.type === 'NEUTRAL')
  );

  // ─── Lista unificada de exibição ──────────────────────────────────────────

  readonly displayItems = computed<BillDisplayItem[]>(() => {
    const installmentItems: BillDisplayItem[] = this.installments().map(inst => {
      const purchase = this.findPurchaseForInstallment(inst);
      return {
        type: 'installment',
        date: inst.purchaseDate,
        description: inst.description,
        amount: inst.amount,
        installmentNumber: inst.installmentNumber,
        totalInstallments: inst.totalInstallments,
        purchaseId: purchase?.id,
      };
    });

    const refundItems: BillDisplayItem[] = this.refunds().map(ref => ({
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

    // Carrega a fatura
    this.creditCardService.getBill(this.cardId, this.billId).subscribe({
      next: bill => this.bill.set(bill),
      error: () => this.router.navigate(['/credit-cards', this.cardId]),
    });

    // Carrega categorias se necessário
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories().subscribe();
    }

    // Carrega compras e statement em paralelo
    let pending = 2;
    const done = () => { if (--pending === 0) this.isLoading.set(false); };

    this.creditCardService.getPurchases(this.cardId).subscribe({
      next: purchases => { this.purchases.set(purchases); done(); },
      error: () => done(),
    });

    this.loadStatement(done);
  }

  private loadStatement(callback?: () => void): void {
    this.creditCardService.getBillStatement(this.cardId, this.billId).subscribe({
      next: statement => {
        this.installments.set(statement.installments);
        this.refunds.set(statement.refunds);
        callback?.();
      },
      error: () => callback?.(),
    });
  }

  // ─── Helpers de correspondência ───────────────────────────────────────────

  private findPurchaseForInstallment(inst: BillInstallmentItem): CreditCardPurchaseDto | undefined {
    return this.purchases().find(p =>
      p.description === inst.description &&
      p.purchaseDate === inst.purchaseDate &&
      p.installmentsCount === inst.totalInstallments
    );
  }

  // ─── Criação de estorno ───────────────────────────────────────────────────

  openCreateRefundModal(): void {
    this.refundForm.reset({ refundDate: this.todayString() });
    this.errorMessage.set(null);
    this.activeModal.set('create-refund');
  }

  submitRefund(): void {
    if (this.refundForm.invalid) {
      this.refundForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    const v = this.refundForm.value;

    this.creditCardService.createRefund(this.cardId, this.billId, {
      description: v.description!,
      amount: v.amount!,
      refundDate: v.refundDate!,
      categoryId: v.categoryId!,
    }).subscribe({
      next: refund => {
        this.refunds.update(list => [...list, refund]);
        this.refreshBill();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao criar estorno.'));
      },
    });
  }

  // ─── Exclusão de compra ───────────────────────────────────────────────────

  openDeletePurchaseConfirm(purchaseId: number, description: string, totalInstallments: number): void {
    this.selectedPurchaseId.set(purchaseId);
    this.selectedPurchaseDescription.set(description);
    this.selectedPurchaseTotalInstallments.set(totalInstallments);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete-purchase');
  }

  deletePurchase(): void {
    const purchaseId = this.selectedPurchaseId();
    if (!purchaseId) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.creditCardService.deletePurchase(this.cardId, purchaseId).subscribe({
      next: () => {
        this.purchases.update(list => list.filter(p => p.id !== purchaseId));
        this.loadStatement();
        this.refreshBill();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir compra.'));
      },
    });
  }

  private refreshBill(): void {
    this.creditCardService.getBill(this.cardId, this.billId).subscribe({
      next: bill => this.bill.set(bill),
    });
  }

  // ─── Exclusão de estorno ──────────────────────────────────────────────────

  openDeleteRefundConfirm(refundId: number, description: string): void {
    this.selectedRefundId.set(refundId);
    this.selectedRefundDescription.set(description);
    this.errorMessage.set(null);
    this.activeModal.set('confirm-delete-refund');
  }

  deleteRefund(): void {
    const refundId = this.selectedRefundId();
    if (!refundId) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.creditCardService.deleteRefund(this.cardId, this.billId, refundId).subscribe({
      next: () => {
        this.refunds.update(list => list.filter(r => r.id !== refundId));
        this.refreshBill();
        this.isSaving.set(false);
        this.closeModal();
      },
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err?.error?.message, 'Erro ao excluir estorno.'));
      },
    });
  }

  // ─── Fechar modal genérico ────────────────────────────────────────────────

  closeModal(): void {
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