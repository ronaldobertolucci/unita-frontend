export interface TransactionDto {
  id: number;
  amount: number;
  direction: 'INCOME' | 'EXPENSE';
  transactionDate: string; // yyyy-MM-dd
  description: string;
  category: {
    id: number;
    name: string;
    type: 'INCOME' | 'EXPENSE' | 'NEUTRAL';
    isSystem: boolean;
  };
}

export interface CreateTransactionPayload {
  amount: number;
  direction: 'INCOME' | 'EXPENSE';
  transactionDate: string;
  description: string;
  categoryId: number;
}