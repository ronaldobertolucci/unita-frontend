export type CategoryType = 'INCOME' | 'EXPENSE' | 'NEUTRAL';

export interface CategoryDto {
  id: number;
  name: string;
  type: CategoryType;
  global: boolean;
}

export interface CreateCategoryPayload {
  name: string;
  type: CategoryType;
}

export interface UpdateCategoryPayload {
  name: string;
  type: CategoryType;
}