export type FinancialOperationType = 'TRANSFER' | 'FGTS_WITHDRAWAL' | 'BILL_PAYMENT' | 'UNLINKED';

export interface TransactionDto {
  id: number;
  amount: number;
  direction: 'INCOME' | 'EXPENSE';
  transactionDate: string; // yyyy-MM-dd
  description: string;
  operationType: FinancialOperationType;
  operationId: number | null;
  canDelete: boolean;
  category: {
    id: number;
    name: string;
    type: 'INCOME' | 'EXPENSE' | 'NEUTRAL';
    isSystem: boolean;
  };
}

export interface TransferResultDto {
  sourceTransaction: TransactionDto;
  targetTransaction: TransactionDto;
}

export interface CreateTransactionPayload {
  amount: number;
  direction: 'INCOME' | 'EXPENSE';
  transactionDate: string;
  description: string;
  categoryId: number;
}
