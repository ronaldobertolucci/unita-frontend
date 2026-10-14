import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FinancialRecoveryService } from '../../core/services/financial-recovery.service';

@Component({
  selector: 'app-financial-recovery',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (recovery.state() !== 'clear' && recovery.state() !== 'sending') {
      <section class="review-notice" aria-live="polite" aria-label="Conferência de operação financeira">
        <p>Não foi possível confirmar o resultado: {{ recovery.operation()?.label }}.</p>
        <p>Confira os saldos, os extratos e, quando houver, a fatura antes de enviar uma nova operação. Se continuar em dúvida, procure suporte para conciliar o resultado.</p>
        @if (recovery.state() === 'review') {
          @for (pocket of recovery.pockets(); track pocket.id) {
            <p><a class="review-link" [routerLink]="['/pockets', pocket.id]">{{ pocket.label }}</a> · Saldo: {{ formatCurrency(pocket.balance) }}</p>
            <ul class="review-history">
              @for (tx of pocket.transactions; track tx.id) {
                <li><span>{{ tx.transactionDate | date:'dd/MM/yyyy':'UTC' }} · {{ tx.description }}</span><strong>{{ tx.direction === 'INCOME' ? '+' : '−' }} {{ formatCurrency(tx.amount) }}</strong></li>
              } @empty { <li>Nenhum lançamento disponível nesta conta.</li> }
            </ul>
          }
          @if (recovery.operation()?.cardId; as cardId) {
            <a class="review-link" [routerLink]="['/credit-cards', cardId]">Conferir histórico do cartão</a>
            <ul class="review-history">
              @for (bill of recovery.bills(); track bill.id) {
                <li><span>{{ bill.dueDate | date:'dd/MM/yyyy':'UTC' }} · {{ bill.status === 'PAID' ? 'Paga' : bill.status === 'CLOSED' ? 'Fechada' : 'Aberta' }}</span><strong>{{ formatCurrency(bill.totalAmount) }}</strong></li>
              }
            </ul>
          }
          <p>A consulta mostra o estado atual. Ela não comprova, sozinha, o resultado de uma operação sem resposta. Contas removidas ou indisponíveis não aparecem.</p>
        }
        <div class="review-actions">
          <button type="button" class="btn-secondary" [disabled]="recovery.state() === 'checking'" (click)="recovery.check()">{{ recovery.state() === 'checking' ? 'Consultando…' : 'Consultar estado atual' }}</button>
          @if (recovery.state() === 'review') {
            <button type="button" class="btn-secondary" (click)="recovery.confirm()">Conciliei o resultado; liberar novas operações</button>
          }
        </div>
        @if (recovery.state() === 'pending') { <p>Novas operações estão bloqueadas até a consulta e a conciliação do resultado.</p> }
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .btn-secondary {
      background: var(--input-bg); color: var(--text-secondary);
      border: 1px solid var(--border-subtle); border-radius: var(--radius-btn);
      font: inherit; cursor: pointer;
    }
    .btn-secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--text-primary); }
  `],
})
export class FinancialRecoveryComponent {
  readonly recovery = inject(FinancialRecoveryService);
  formatCurrency(amount: number): string {
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
