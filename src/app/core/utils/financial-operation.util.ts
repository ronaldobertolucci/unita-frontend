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
  if (error?.error?.error === 'Concurrency Conflict' || isUncertainFinancialWrite(error)) {
    return financialWriteErrorMessage(error, fallback);
  }
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

/** Messages for writes: a domain conflict is not a protected deletion or proof of success. */
export function financialWriteErrorMessage(error: any, fallback: string): string {
  if (error?.status === 409 && error?.error?.error === 'Concurrency Conflict') {
    return 'A operação foi desfeita por um conflito de concorrência. Confira os dados atualizados antes de enviar novamente.';
  }
  if (error?.status === 503 && error?.error?.error === 'Concurrency Timeout') {
    return 'O tempo de espera por outra operação financeira foi excedido. Confira o estado atual antes de enviar novamente.';
  }
  if (isUncertainFinancialWrite(error)) {
    return (error?.status ?? 0) >= 500
      ? 'O serviço está indisponível. Consulte o estado atual e concilie o resultado antes de enviar novamente.'
      : 'A resposta não foi recebida. Consulte o estado atual e concilie o resultado antes de enviar novamente.';
  }
  if (error?.status === 404) return 'Recurso indisponível. Atualize a seleção.';
  if (error?.status === 401) return 'Recupere sua sessão e confira os dados antes de enviar novamente.';
  if (error?.status === 409) {
    return translateApiError(error?.error?.message, 'A operação conflitou com o estado atual. Confira os dados atualizados.');
  }
  if (error?.error?.error === 'Validation Failed') {
    return translateApiError(error?.error?.message, 'Verifique os campos informados antes de enviar novamente.');
  }
  return translateApiError(error?.error?.message, fallback);
}
