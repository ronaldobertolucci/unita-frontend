import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, defer, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { SessionService } from './session.service';
import { PocketService } from './pocket.service';
import { TransactionService } from './transaction.service';
import { CreditCardService } from './credit-card.service';
import { AssetService } from './asset.service';
import { AssetDetailDto, InvestmentTransactionDto } from '../models/asset.model';
import { TransactionDto } from '../models/transaction.model';
import { BillStatementDto, CreditCardBillDto, CreditCardPurchaseDto, CreditCardRefundDto } from '../models/credit-card.model';
import { isUncertainFinancialWrite } from '../utils/financial-operation.util';

interface PendingOperation {
  label: string;
  pocketIds: number[];
  assetId?: number;
  cardId?: number;
  billId?: number;
  reviewPurchases?: boolean;
  reviewRefunds?: boolean;
  purchaseId?: number;
  message?: string;
}

export interface PocketReview {
  id: number;
  label: string;
  balance: number;
  transactions: TransactionDto[];
}

/** A lost response requires fresh reads and explicit reconciliation, even after navigation. */
@Injectable({ providedIn: 'root' })
export class FinancialRecoveryService {
  private readonly injector = inject(Injector);
  private readonly session = inject(SessionService);
  private ownerId: number | null = null;
  readonly state = signal<'clear' | 'sending' | 'pending' | 'checking' | 'review'>('clear');
  readonly operation = signal<PendingOperation | null>(null);
  readonly pockets = signal<PocketReview[]>([]);
  readonly bills = signal<CreditCardBillDto[]>([]);
  readonly purchases = signal<CreditCardPurchaseDto[]>([]);
  readonly refunds = signal<CreditCardRefundDto[]>([]);
  readonly refundStatement = signal<BillStatementDto | null>(null);
  readonly investment = signal<{ asset: AssetDetailDto; transactions: InvestmentTransactionDto[] } | null>(null);

  constructor() {
    const destroy = inject(DestroyRef);
    this.session.contextChanges$.pipe(takeUntilDestroyed(destroy)).subscribe(reason => {
      // Expiry cancels HTTP, but cannot prove that the server rolled back a write.
      // Preserve the obligation to reconcile only for the renewing account.
      if (reason === 'expired' && this.operation() && this.ownerId !== null &&
          this.ownerId === this.session.renewalOwner()) {
        this.clearReview();
        this.state.set('pending');
      } else {
        this.clear();
      }
    });
    this.session.sessionUpdates$.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
      if (this.operation() && this.ownerId !== this.session.user()?.id) this.clear();
    });
    destroy.onDestroy(() => this.clear());
  }

  mark(operation: PendingOperation): void {
    this.ownerId = this.session.user()?.id ?? this.session.renewalOwner();
    this.operation.set(operation);
    this.clearReview();
    this.state.set('pending');
  }

  trackWrite<T>(operation: PendingOperation, request: Observable<T>): Observable<T> {
    return defer(() => {
      const version = this.session.version();
      this.ownerId = this.session.user()?.id ?? this.session.renewalOwner();
      this.operation.set(operation);
      this.state.set('sending');
      return request.pipe(
        tap({
          next: () => {
            if (version === this.session.version() && this.operation() === operation) this.clear();
          },
          error: error => {
            if (version === this.session.version() && this.operation() === operation) {
              isUncertainFinancialWrite(error) ? this.mark(operation) : this.clear();
            }
          },
        }),
        finalize(() => {
          // Navigation can cancel HTTP after the server has already applied a write.
          if (version === this.session.version() && this.operation() === operation && this.state() === 'sending') {
            this.mark(operation);
            this.check();
          }
        }),
      );
    });
  }

  refreshPockets(pocketIds: number[]): Observable<PocketReview[]> {
    pocketIds = pocketIds.map(Number);
    const pockets = this.injector.get(PocketService);
    const transactions = this.injector.get(TransactionService);
    return pockets.loadPockets().pipe(switchMap(owned => {
      // Sharing a group never grants access to another member's balance or statement.
      const accessible = owned.filter(p => pocketIds.includes(p.id));
      return accessible.length ? forkJoin(accessible.map(p => forkJoin({
        balance: pockets.getBalance(p.id),
        transactions: transactions.getTransactions(p.id),
      }).pipe(map(data => ({ id: p.id, label: p.label, ...data }))))) : of([]);
    }));
  }

  check(): void {
    this.session.getToken();
    const operation = this.operation();
    if (!operation || this.state() === 'checking' || this.state() === 'sending') return;
    if (this.ownerId !== null && this.ownerId !== this.session.user()?.id) return;
    const version = this.session.version();
    this.state.set('checking');
    const emptyCard = { bills: [] as CreditCardBillDto[], purchases: [] as CreditCardPurchaseDto[],
      refunds: [] as CreditCardRefundDto[], statement: null as BillStatementDto | null };
    const cards = operation.cardId === undefined ? of(emptyCard) :
      this.injector.get(CreditCardService).loadCreditCards().pipe(switchMap(list =>
        list.some(card => card.id === operation.cardId)
          ? forkJoin({ bills: this.readBills(operation), purchases: this.readPurchases(operation),
            refunds: operation.reviewRefunds && operation.billId !== undefined
              ? this.injector.get(CreditCardService).getRefunds(operation.cardId!, operation.billId) : of([]),
            statement: operation.reviewRefunds && operation.billId !== undefined
              ? this.injector.get(CreditCardService).getBillStatement(operation.cardId!, operation.billId) : of(null) })
          : of(emptyCard)));
    const investment = operation.assetId === undefined ? of(null) : forkJoin({
      asset: this.injector.get(AssetService).getAsset(operation.assetId),
      transactions: this.injector.get(AssetService).getTransactions(operation.assetId),
    });
    this.session.scoped(() => forkJoin({ pockets: this.refreshPockets(operation.pocketIds), card: cards, investment }))
      .pipe(finalize(() => {
        if (version === this.session.version() && this.operation() === operation && this.state() === 'checking') this.state.set('pending');
      })).subscribe({
        next: data => {
          if (version !== this.session.version() || this.operation() !== operation) return;
          this.pockets.set(data.pockets);
          this.bills.set(data.card.bills);
          this.purchases.set(data.card.purchases);
          this.refunds.set(data.card.refunds);
          this.refundStatement.set(data.card.statement);
          this.investment.set(data.investment);
          this.state.set('review');
        },
        error: () => {},
      });
  }

  private readPurchases(operation: PendingOperation): Observable<CreditCardPurchaseDto[]> {
    if (!operation.reviewPurchases) return of([]);
    const cards = this.injector.get(CreditCardService);
    return cards.getPurchases(operation.cardId!).pipe(switchMap(list =>
      operation.purchaseId !== undefined && list.some(p => p.id === operation.purchaseId)
        ? cards.getPurchase(operation.cardId!, operation.purchaseId).pipe(
          map(purchase => list.map(p => p.id === purchase.id ? purchase : p)))
        : of(list)));
  }

  private readBills(operation: PendingOperation): Observable<CreditCardBillDto[]> {
    const cards = this.injector.get(CreditCardService);
    const list = cards.getBills(operation.cardId!);
    if (operation.billId === undefined) return list;
    return forkJoin({ list, bill: cards.getBill(operation.cardId!, operation.billId) }).pipe(
      map(({ list, bill }) => [...list.filter(item => item.id !== bill.id), bill]),
    );
  }

  confirm(): void {
    this.session.getToken();
    if (this.state() === 'review') this.clear();
  }

  private clear(): void {
    this.ownerId = null;
    this.state.set('clear');
    this.operation.set(null);
    this.clearReview();
  }

  private clearReview(): void {
    this.pockets.set([]);
    this.bills.set([]);
    this.purchases.set([]);
    this.refunds.set([]);
    this.refundStatement.set(null);
    this.investment.set(null);
  }
}
