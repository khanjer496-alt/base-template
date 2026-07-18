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
  /** Last 4 digits of the card/account number, when known from SMS. */
  last4?: string;
  /** For kind 'card': whether it's a credit or debit card. */
  cardType?: 'credit' | 'debit';
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
  /** Where this entry came from. Undefined = manual (pre-v2 data). */
  source?: 'sms' | 'manual';
  /** Credit-card payments etc — excluded from spending/income analytics. */
  isTransfer?: boolean;
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

/** A credit-card statement obligation parsed from SMS (or entered manually). */
export interface CardDue {
  id: string;
  accountId: string;
  totalDueFils: number;
  minDueFils: number;
  /** ISO date the payment is due by. */
  dueDate: string;
  /** Fils paid toward this due so far. */
  paidFils: number;
  /** ISO date settled (paid >= min or total), if settled. */
  settledAt?: string;
}

export interface Goal {
  id: string;
  title: string;
  emoji: string;
  targetFils: number;
  savedFils: number;
}

export interface AppState {
  hydrated: boolean;
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  cardDues: CardDue[];
  goals: Goal[];
  /** Learned merchant → category corrections, keyed by lowercased merchant. */
  merchantOverrides: Record<string, CategoryId>;
  /** Card/account last4 → accountId, learned from SMS. */
  accountHints: Record<string, string>;
  /** Epoch ms of the newest SMS already scanned. */
  lastScanTs: number;
  /** Whether the first-run onboarding has completed. */
  onboarded: boolean;
  userName: string;
  appLock: boolean;
}
