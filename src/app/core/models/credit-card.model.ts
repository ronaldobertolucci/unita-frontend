// ─── Entidades ───────────────────────────────────────────────────────────────

export interface CreditCardDto {
  id: number;
  legalEntityCorporateName: string;
  lastFourDigits: string;
  cardBrand: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
}

export interface CreditCardBillDto {
  id: number;
  closingDate: string;        // yyyy-MM-dd
  dueDate: string;            // yyyy-MM-dd
  status: BillStatus;
  totalInstallments: number;
  totalRefunds: number;
  totalAmount: number;
  paymentId?: number | null;
}

export type BillStatus = 'OPEN' | 'CLOSED' | 'PAID';

export interface CreditCardPurchaseDto {
  id: number;
  description: string;
  totalValue: number;
  purchaseDate: string;       // yyyy-MM-dd
  installmentsCount: number;
  installments: CreditCardInstallmentDto[];
}

export interface CreditCardInstallmentDto {
  id: number;
  installmentNumber: number;
  amount: number;
  creditCardBillId: number;
  installmentDate: string;    // yyyy-MM-dd, definida pelo backend
  billDueDate: string;        // yyyy-MM-dd
  category: InstallmentCategory;
  // campos extras usados no BillStatement
  description?: string;
  purchaseDate?: string;
  totalInstallments?: number;
}

export interface InstallmentCategory {
  id: number;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'NEUTRAL';
  global?: boolean;
  isSystem?: boolean; // Compatibilidade com extratos anteriores.
}

export interface CreditCardRefundDto {
  id: number;
  description: string;
  amount: number;
  refundDate: string;         // yyyy-MM-dd
  category: InstallmentCategory;
}

export interface BillStatementDto {
  installments: BillInstallmentItem[];
  refunds: BillRefundItem[];
}

export interface BillInstallmentItem {
  id: number;
  description: string;
  amount: number;
  purchaseDate: string;
  installmentNumber: number;
  totalInstallments: number;
  category: InstallmentCategory;
}

export interface BillRefundItem {
  id: number;
  description: string;
  amount: number;
  refundDate: string;
  category: InstallmentCategory;
}

export interface CardBrandDto {
  id: number;
  name: string;
}

// ─── Payloads ────────────────────────────────────────────────────────────────

export interface CreateCreditCardPayload {
  legalEntityId: number;
  lastFourDigits: string;
  cardBrandId: number;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
}

export interface UpdateCreditCardPayload {
  closingDay?: number;
  dueDay?: number;
  creditLimit?: number;
}

export interface CreatePurchasePayload {
  description: string;
  totalValue: number;
  purchaseDate: string;
  installmentsCount: number;
  categoryId: number;
  installmentMode?: 'AUTOMATIC' | 'CUSTOM';
  installments?: PurchaseInstallmentPayload[];
}

export interface PurchaseInstallmentPayload {
  installmentNumber: number;
  amount: number;
  categoryId?: number;
}

export interface UpdateInstallmentPayload {
  amount: number;
  creditCardBillId: number;
}

export interface CreateRefundPayload {
  description: string;
  amount: number;
  refundDate: string;
  categoryId: number;
}

export interface PayBillPayload {
  pocketId: number;
}
