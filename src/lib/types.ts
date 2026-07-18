export type TransactionType = 'expense' | 'income';

export type CategoryId =
  | 'groceries'
  | 'dining'
  | 'transport'
  | 'utilities'
  | 'telecom'
  | 'rent'
  | 'shopping'
  | 'health'
  | 'education'
  | 'travel'
  | 'entertainment'
  | 'charity'
  | 'salary'
  | 'business'
  | 'other';

export type AccountKind = 'bank' | 'card' | 'cash';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Opening balance in fils (1 AED = 100 fils). Current balance is derived from transactions. */
  openingFils: number;
  color: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Amount in fils, always positive. */
  amountFils: number;
  category: CategoryId;
  accountId: string;
  title: string;
  note?: string;
  /** ISO date string, e.g. 2026-07-18 */
  date: string;
}

export interface Budget {
  /** One budget per expense category, applies monthly. */
  category: CategoryId;
  limitFils: number;
}

export interface Bill {
  id: string;
  title: string;
  category: CategoryId;
  /** Expected amount in fils. */
  amountFils: number;
  /** Day of month the bill is due (1–31). */
  dueDay: number;
  accountId?: string;
  /** True when created from a detected SMS/recurring pattern. */
  autoDetected?: boolean;
  /** Month keys (YYYY-MM) already marked as paid. */
  paidMonths: string[];
}

export interface AppState {
  hydrated: boolean;
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  userName: string;
  appLock: boolean;
}
