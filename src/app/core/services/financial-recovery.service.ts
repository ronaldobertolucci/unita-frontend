import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { Observable, defer, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { SessionService } from './session.service';
import { PocketService } from './pocket.service';
import { TransactionService } from './transaction.service';
import { CreditCardService } from './credit-card.service';
import { TransactionDto } from '../models/transaction.model';
import { CreditCardBillDto } from '../models/credit-card.model';
import { isUncertainFinancialWrite } from '../utils/financial-operation.util';

interface PendingOperation {
  label: string;
  pocketIds: number[];
  cardId?: number;
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
  readonly state = signal<'clear' | 'sending' | 'pending' | 'checking' | 'review'>('clear');
  readonly operation = signal<PendingOperation | null>(null);
  readonly pockets = signal<PocketReview[]>([]);
  readonly bills = signal<CreditCardBillDto[]>([]);

  constructor() {
    this.session.registerCleanup(() => this.clear(), inject(DestroyRef));
  }

  mark(operation: PendingOperation): void {
    this.operation.set(operation);
    this.pockets.set([]);
    this.bills.set([]);
    this.state.set('pending');
  }

  trackWrite<T>(operation: PendingOperation, request: Observable<T>): Observable<T> {
    return defer(() => {
      const version = this.session.version();
      this.operation.set(operation);
      this.state.set('sending');
      return request.pipe(
        tap({
          next: () => this.clear(),
          error: error => isUncertainFinancialWrite(error) ? this.mark(operation) : this.clear(),
        }),
        finalize(() => {
          // Navigation can cancel HTTP after the server has already applied a write.
          if (version === this.session.version() && this.state() === 'sending') {
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
    const operation = this.operation();
    if (!operation || this.state() === 'checking' || this.state() === 'sending') return;
    const version = this.session.version();
    this.state.set('checking');
    const cards = operation.cardId === undefined ? of([] as CreditCardBillDto[]) :
      this.injector.get(CreditCardService).loadCreditCards().pipe(switchMap(list =>
        list.some(card => card.id === operation.cardId)
          ? this.injector.get(CreditCardService).getBills(operation.cardId!)
          : of([] as CreditCardBillDto[])));
    this.session.scoped(() => forkJoin({ pockets: this.refreshPockets(operation.pocketIds), bills: cards }))
      .pipe(finalize(() => {
        if (version === this.session.version() && this.state() === 'checking') this.state.set('pending');
      })).subscribe({
        next: data => {
          this.pockets.set(data.pockets);
          this.bills.set(data.bills);
          this.state.set('review');
        },
        error: () => {},
      });
  }

  confirm(): void {
    if (this.state() === 'review') this.clear();
  }

  private clear(): void {
    this.state.set('clear');
    this.operation.set(null);
    this.pockets.set([]);
    this.bills.set([]);
  }
}
