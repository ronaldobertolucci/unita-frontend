import { TransactionDto } from '../models/transaction.model';
import { translateApiError } from './api-error.util';

export function transactionProtectionMessage(tx: TransactionDto): string {
  if (tx.canDelete !== false) return '';
  const labels = {
    TRANSFER: 'Transferência vinculada',
    FGTS_WITHDRAWAL: 'Saque FGTS vinculado',
    BILL_PAYMENT: 'Pagamento de fatura vinculado',
    UNLINKED: 'Operação financeira protegida',
  };
  return `${labels[tx.operationType ?? 'UNLINKED'] ?? 'Operação financeira protegida'} — exclusão indisponível.`;
}

export function isUncertainFinancialWrite(error: { status?: number }): boolean {
  return error.status === 0 || error.status === 408 || (error.status ?? 0) >= 500;
}

export function financialErrorMessage(error: any, resource: 'transaction' | 'pocket' | 'card', fallback: string): string {
  if (error?.status === 409) {
    const messages = {
      transaction: 'Este lançamento está vinculado a uma operação financeira e não pode ser excluído.',
      pocket: 'Este pocket contém lançamentos vinculados a operações financeiras e não pode ser excluído.',
      card: 'Este cartão possui pagamentos de fatura vinculados e não pode ser excluído.',
    };
    return messages[resource];
  }
  if (error?.status === 404) return 'Recurso indisponível. Atualize a seleção.';
  if (error?.status === 401) return 'Recupere sua sessão e confira os dados antes de enviar novamente.';
  return translateApiError(error?.error?.message, fallback);
}
