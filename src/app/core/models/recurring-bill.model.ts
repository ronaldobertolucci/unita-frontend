export type RecurringFrequency = 'MONTHLY' | 'YEARLY';

export interface RecurringBillPayload {
  description: string;
  expectedAmount: number | null;
  frequency: RecurringFrequency;
  firstDueDate: string;
  reminderDaysBefore: number;
  emailEnabled: boolean;
  active: boolean;
  notes: string | null;
}
export interface RecurringBill extends RecurringBillPayload {
  id: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface RecurringBillPage {
  content: RecurringBill[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export interface RecurringOccurrence {
  recurringBillId: number;
  description: string;
  expectedAmount: number | null;
  dueDate: string;
}
