import type { CategoryId, TransactionType } from '@/lib/types';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  emoji: string;
  color: string;
  type: TransactionType;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'groceries', label: 'Groceries', emoji: '🛒', color: '#34D399', type: 'expense' },
  { id: 'dining', label: 'Dining', emoji: '🍽️', color: '#FB923C', type: 'expense' },
  { id: 'transport', label: 'Transport', emoji: '🚕', color: '#38BDF8', type: 'expense' },
  { id: 'utilities', label: 'Utilities', emoji: '💡', color: '#FACC15', type: 'expense' },
  { id: 'telecom', label: 'Telecom', emoji: '📱', color: '#A78BFA', type: 'expense' },
  { id: 'rent', label: 'Rent', emoji: '🏠', color: '#F472B6', type: 'expense' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#FB7185', type: 'expense' },
  { id: 'health', label: 'Health', emoji: '🩺', color: '#4ADE80', type: 'expense' },
  { id: 'education', label: 'Education', emoji: '🎓', color: '#60A5FA', type: 'expense' },
  { id: 'travel', label: 'Travel', emoji: '✈️', color: '#22D3EE', type: 'expense' },
  { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#C084FC', type: 'expense' },
  { id: 'charity', label: 'Charity', emoji: '🤲', color: '#2DD4A8', type: 'expense' },
  { id: 'other', label: 'Other', emoji: '🧾', color: '#94A3B8', type: 'expense' },
  { id: 'salary', label: 'Salary', emoji: '💼', color: '#34D399', type: 'income' },
  { id: 'business', label: 'Business', emoji: '📈', color: '#2DD4A8', type: 'income' },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): CategoryMeta {
  return byId.get(id) ?? byId.get('other')!;
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.type === 'expense');
export const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.type === 'income');
