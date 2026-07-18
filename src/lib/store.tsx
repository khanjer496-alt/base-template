import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

import { generateSeedTransactions, SEED_ACCOUNTS, SEED_BUDGETS } from '@/lib/seed';
import type {
  Account,
  AppState,
  Bill,
  Budget,
  CardDue,
  CategoryId,
  Goal,
  Transaction,
} from '@/lib/types';

const STORAGE_KEY = 'wafra/state/v1';

const EMPTY_STATE: AppState = {
  hydrated: false,
  accounts: [],
  transactions: [],
  budgets: [],
  bills: [],
  cardDues: [],
  goals: [],
  merchantOverrides: {},
  accountHints: {},
  notSubscriptions: [],
  lastScanTs: 0,
  onboarded: false,
  userName: 'there',
  appLock: false,
};

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}-${Math.floor(Math.random() * 1e6)}`;
}

function sortTxs(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

type Action =
  | { type: 'hydrate'; state: Partial<Omit<AppState, 'hydrated'>> }
  | { type: 'addTransaction'; transaction: Transaction }
  | { type: 'editTransaction'; id: string; patch: Partial<Omit<Transaction, 'id'>> }
  | { type: 'deleteTransaction'; id: string }
  | {
      type: 'importBatch';
      transactions: Transaction[];
      newAccounts: Account[];
      newHints: Record<string, string>;
      newDues: CardDue[];
      lastScanTs: number;
    }
  | { type: 'undoBatch'; ids: string[] }
  | { type: 'upsertBudget'; budget: Budget }
  | { type: 'deleteBudget'; category: Budget['category'] }
  | { type: 'addAccount'; account: Account }
  | { type: 'editAccount'; id: string; patch: Partial<Omit<Account, 'id'>> }
  | { type: 'deleteAccount'; id: string }
  | { type: 'addBill'; bill: Bill }
  | { type: 'deleteBill'; id: string }
  | { type: 'markBillPaid'; id: string; month: string; transaction: Transaction }
  | { type: 'upsertCardDue'; due: CardDue }
  | { type: 'payCardDue'; id: string; amountFils: number; transaction: Transaction | null; settledAt: string | null }
  | { type: 'setMerchantOverride'; merchant: string; category: CategoryId; applyToExisting: boolean }
  | { type: 'setNotSubscription'; merchant: string; dismissed: boolean }
  | { type: 'reassignAccountHint'; last4: string; accountId: string }
  | { type: 'addGoal'; goal: Goal }
  | { type: 'editGoal'; id: string; patch: Partial<Omit<Goal, 'id'>> }
  | { type: 'deleteGoal'; id: string }
  | { type: 'setAppLock'; enabled: boolean }
  | { type: 'setOnboarded' }
  | { type: 'restore'; state: Partial<Omit<AppState, 'hydrated'>> }
  | { type: 'loadDemo'; state: Partial<Omit<AppState, 'hydrated'>> }
  | { type: 'clearAll' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
    case 'loadDemo':
    case 'restore':
      // Merge over defaults so states saved by older app versions stay valid.
      return { ...EMPTY_STATE, ...action.state, hydrated: true };
    case 'addTransaction':
      return { ...state, transactions: sortTxs([action.transaction, ...state.transactions]) };
    case 'editTransaction': {
      const transactions = sortTxs(
        state.transactions.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      );
      return { ...state, transactions };
    }
    case 'deleteTransaction':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };
    case 'importBatch': {
      const dues = [...state.cardDues];
      for (const due of action.newDues) {
        const i = dues.findIndex((d) => d.accountId === due.accountId && !d.settledAt);
        if (i >= 0) dues[i] = { ...due, id: dues[i].id };
        else dues.push(due);
      }
      return {
        ...state,
        transactions: sortTxs([...action.transactions, ...state.transactions]),
        accounts: [...state.accounts, ...action.newAccounts],
        accountHints: { ...state.accountHints, ...action.newHints },
        cardDues: dues,
        lastScanTs: Math.max(state.lastScanTs, action.lastScanTs),
      };
    }
    case 'undoBatch': {
      const ids = new Set(action.ids);
      return { ...state, transactions: state.transactions.filter((t) => !ids.has(t.id)) };
    }
    case 'upsertBudget': {
      const others = state.budgets.filter((b) => b.category !== action.budget.category);
      return { ...state, budgets: [...others, action.budget] };
    }
    case 'deleteBudget':
      return { ...state, budgets: state.budgets.filter((b) => b.category !== action.category) };
    case 'addAccount':
      return { ...state, accounts: [...state.accounts, action.account] };
    case 'editAccount':
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)),
      };
    case 'deleteAccount':
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.id),
        transactions: state.transactions.filter((t) => t.accountId !== action.id),
        cardDues: state.cardDues.filter((d) => d.accountId !== action.id),
        accountHints: Object.fromEntries(
          Object.entries(state.accountHints).filter(([, v]) => v !== action.id),
        ),
      };
    case 'addBill':
      return { ...state, bills: [...state.bills, action.bill] };
    case 'deleteBill':
      return { ...state, bills: state.bills.filter((b) => b.id !== action.id) };
    case 'markBillPaid': {
      const bills = state.bills.map((b) =>
        b.id === action.id && !b.paidMonths.includes(action.month)
          ? { ...b, paidMonths: [...b.paidMonths, action.month] }
          : b,
      );
      return { ...state, bills, transactions: sortTxs([action.transaction, ...state.transactions]) };
    }
    case 'upsertCardDue': {
      const i = state.cardDues.findIndex(
        (d) => d.accountId === action.due.accountId && !d.settledAt,
      );
      const cardDues = [...state.cardDues];
      if (i >= 0) cardDues[i] = { ...action.due, id: cardDues[i].id };
      else cardDues.push(action.due);
      return { ...state, cardDues };
    }
    case 'payCardDue': {
      const cardDues = state.cardDues.map((d) =>
        d.id === action.id
          ? {
              ...d,
              paidFils: d.paidFils + action.amountFils,
              settledAt: action.settledAt ?? d.settledAt,
            }
          : d,
      );
      const transactions = action.transaction
        ? sortTxs([action.transaction, ...state.transactions])
        : state.transactions;
      return { ...state, cardDues, transactions };
    }
    case 'setMerchantOverride': {
      const key = action.merchant.trim().toLowerCase();
      const merchantOverrides = { ...state.merchantOverrides, [key]: action.category };
      const transactions = action.applyToExisting
        ? state.transactions.map((t) =>
            t.title.trim().toLowerCase() === key ? { ...t, category: action.category } : t,
          )
        : state.transactions;
      return { ...state, merchantOverrides, transactions };
    }
    case 'setNotSubscription': {
      const key = action.merchant.trim().toLowerCase();
      const rest = state.notSubscriptions.filter((m) => m !== key);
      return { ...state, notSubscriptions: action.dismissed ? [...rest, key] : rest };
    }
    case 'reassignAccountHint':
      return {
        ...state,
        accountHints: { ...state.accountHints, [action.last4]: action.accountId },
      };
    case 'addGoal':
      return { ...state, goals: [...state.goals, action.goal] };
    case 'editGoal':
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };
    case 'deleteGoal':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case 'setAppLock':
      return { ...state, appLock: action.enabled };
    case 'setOnboarded':
      return { ...state, onboarded: true };
    case 'clearAll':
      return {
        ...EMPTY_STATE,
        hydrated: true,
        onboarded: true,
        accounts: [SEED_ACCOUNTS[2]],
      };
    default:
      return state;
  }
}

export interface ImportBatchInput {
  transactions: Omit<Transaction, 'id'>[];
  newAccounts: Omit<Account, 'id'>[];
  /** last4 → index into newAccounts OR existing accountId. */
  newHints: Record<string, string>;
  newDues: Omit<CardDue, 'id'>[];
  lastScanTs: number;
}

interface StoreValue {
  state: AppState;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  editTransaction: (id: string, patch: Partial<Omit<Transaction, 'id'>>) => void;
  deleteTransaction: (id: string) => void;
  /** Bulk import; returns the created transaction ids for undo. */
  importBatch: (input: ImportBatchInput) => string[];
  undoBatch: (ids: string[]) => void;
  upsertBudget: (b: Budget) => void;
  deleteBudget: (category: Budget['category']) => void;
  addAccount: (a: Omit<Account, 'id'>) => void;
  editAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => void;
  deleteAccount: (id: string) => void;
  addBill: (b: Omit<Bill, 'id' | 'paidMonths'>) => void;
  deleteBill: (id: string) => void;
  markBillPaid: (id: string, month: string, transaction: Omit<Transaction, 'id'>) => void;
  upsertCardDue: (due: Omit<CardDue, 'id'>) => void;
  payCardDue: (id: string, amountFils: number, transaction: Omit<Transaction, 'id'> | null, settled: boolean) => void;
  setMerchantOverride: (merchant: string, category: CategoryId, applyToExisting: boolean) => void;
  setNotSubscription: (merchant: string, dismissed: boolean) => void;
  reassignAccountHint: (last4: string, accountId: string) => void;
  addGoal: (g: Omit<Goal, 'id'>) => void;
  editGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void;
  deleteGoal: (id: string) => void;
  setAppLock: (enabled: boolean) => void;
  setOnboarded: () => void;
  exportBackup: () => string;
  restoreBackup: (json: string) => boolean;
  loadDemoData: () => void;
  clearAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const SEED_BILLS: Bill[] = [
  { id: 'bill-dewa', title: 'DEWA Bill', category: 'utilities', amountFils: 45_000, dueDay: 25, paidMonths: [] },
  { id: 'bill-etisalat', title: 'Etisalat Postpaid', category: 'telecom', amountFils: 19_900, dueDay: 5, paidMonths: [] },
  { id: 'bill-du', title: 'du Home Internet', category: 'telecom', amountFils: 38_900, dueDay: 10, paidMonths: [] },
];

function demoState(): Partial<Omit<AppState, 'hydrated'>> {
  return {
    accounts: SEED_ACCOUNTS,
    transactions: generateSeedTransactions(new Date()),
    budgets: SEED_BUDGETS,
    bills: SEED_BILLS,
    goals: [{ id: 'goal-demo', title: 'Emergency fund', emoji: 'target', targetFils: 2_000_000, savedFils: 650_000 }],
    onboarded: true,
    userName: 'there',
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Omit<AppState, 'hydrated'>>;
          // Pre-onboarding builds stored data without the flag; count them as onboarded.
          if (parsed.onboarded === undefined) parsed.onboarded = true;
          // Repair rows imported before the masked-PAN parser fix: titles like
          // "4782********4499 Has Bee..." are card settlements, not spending.
          if (parsed.transactions) {
            parsed.transactions = parsed.transactions.map((t) =>
              t.source === 'sms' && /^\d{4,6}[Xx*•]{2,}\d{4}/.test(t.title)
                ? { ...t, title: 'Card payment', isTransfer: true, category: 'other' as const }
                : t,
            );
          }
          dispatch({ type: 'hydrate', state: parsed });
        } else {
          dispatch({ type: 'hydrate', state: { onboarded: false } });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'hydrate', state: { onboarded: false } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _hydrated, ...toSave } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [state]);

  const addTransaction = useCallback((t: Omit<Transaction, 'id'>) => {
    dispatch({ type: 'addTransaction', transaction: { ...t, id: makeId('tx') } });
  }, []);

  const editTransaction = useCallback((id: string, patch: Partial<Omit<Transaction, 'id'>>) => {
    dispatch({ type: 'editTransaction', id, patch });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    dispatch({ type: 'deleteTransaction', id });
  }, []);

  const importBatch = useCallback((input: ImportBatchInput) => {
    const newAccounts: Account[] = input.newAccounts.map((a) => ({ ...a, id: makeId('acc') }));
    // Hints pointing at a numeric index refer to a just-created account.
    const newHints: Record<string, string> = {};
    for (const [last4, ref] of Object.entries(input.newHints)) {
      const idx = Number(ref);
      newHints[last4] = Number.isInteger(idx) && idx >= 0 && idx < newAccounts.length && String(idx) === ref
        ? newAccounts[idx].id
        : ref;
    }
    const transactions: Transaction[] = input.transactions.map((t) => ({
      ...t,
      // Resolve index-refs in accountId the same way.
      accountId:
        /^\d+$/.test(t.accountId) && Number(t.accountId) < newAccounts.length
          ? newAccounts[Number(t.accountId)].id
          : t.accountId,
      id: makeId('tx'),
    }));
    const newDues: CardDue[] = input.newDues.map((d) => ({
      ...d,
      accountId:
        /^\d+$/.test(d.accountId) && Number(d.accountId) < newAccounts.length
          ? newAccounts[Number(d.accountId)].id
          : d.accountId,
      id: makeId('due'),
    }));
    dispatch({
      type: 'importBatch',
      transactions,
      newAccounts,
      newHints,
      newDues,
      lastScanTs: input.lastScanTs,
    });
    return transactions.map((t) => t.id);
  }, []);

  const undoBatch = useCallback((ids: string[]) => {
    dispatch({ type: 'undoBatch', ids });
  }, []);

  const upsertBudget = useCallback((budget: Budget) => {
    dispatch({ type: 'upsertBudget', budget });
  }, []);

  const deleteBudget = useCallback((category: Budget['category']) => {
    dispatch({ type: 'deleteBudget', category });
  }, []);

  const addAccount = useCallback((a: Omit<Account, 'id'>) => {
    dispatch({ type: 'addAccount', account: { ...a, id: makeId('acc') } });
  }, []);

  const editAccount = useCallback((id: string, patch: Partial<Omit<Account, 'id'>>) => {
    dispatch({ type: 'editAccount', id, patch });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    dispatch({ type: 'deleteAccount', id });
  }, []);

  const addBill = useCallback((b: Omit<Bill, 'id' | 'paidMonths'>) => {
    dispatch({ type: 'addBill', bill: { ...b, id: makeId('bill'), paidMonths: [] } });
  }, []);

  const deleteBill = useCallback((id: string) => {
    dispatch({ type: 'deleteBill', id });
  }, []);

  const markBillPaid = useCallback(
    (id: string, month: string, transaction: Omit<Transaction, 'id'>) => {
      dispatch({ type: 'markBillPaid', id, month, transaction: { ...transaction, id: makeId('tx') } });
    },
    [],
  );

  const upsertCardDue = useCallback((due: Omit<CardDue, 'id'>) => {
    dispatch({ type: 'upsertCardDue', due: { ...due, id: makeId('due') } });
  }, []);

  const payCardDue = useCallback(
    (id: string, amountFils: number, transaction: Omit<Transaction, 'id'> | null, settled: boolean) => {
      dispatch({
        type: 'payCardDue',
        id,
        amountFils,
        transaction: transaction ? { ...transaction, id: makeId('tx') } : null,
        settledAt: settled ? new Date().toISOString() : null,
      });
    },
    [],
  );

  const setMerchantOverride = useCallback(
    (merchant: string, category: CategoryId, applyToExisting: boolean) => {
      dispatch({ type: 'setMerchantOverride', merchant, category, applyToExisting });
    },
    [],
  );

  const setNotSubscription = useCallback((merchant: string, dismissed: boolean) => {
    dispatch({ type: 'setNotSubscription', merchant, dismissed });
  }, []);

  const reassignAccountHint = useCallback((last4: string, accountId: string) => {
    dispatch({ type: 'reassignAccountHint', last4, accountId });
  }, []);

  const addGoal = useCallback((g: Omit<Goal, 'id'>) => {
    dispatch({ type: 'addGoal', goal: { ...g, id: makeId('goal') } });
  }, []);

  const editGoal = useCallback((id: string, patch: Partial<Omit<Goal, 'id'>>) => {
    dispatch({ type: 'editGoal', id, patch });
  }, []);

  const deleteGoal = useCallback((id: string) => {
    dispatch({ type: 'deleteGoal', id });
  }, []);

  const setAppLock = useCallback((enabled: boolean) => {
    dispatch({ type: 'setAppLock', enabled });
  }, []);

  const setOnboarded = useCallback(() => {
    dispatch({ type: 'setOnboarded' });
  }, []);

  const exportBackup = useCallback(() => {
    const { hydrated: _h, ...data } = state;
    return JSON.stringify({ app: 'wafra', version: 1, exportedAt: new Date().toISOString(), data });
  }, [state]);

  const restoreBackup = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json);
      if (parsed?.app !== 'wafra' || !parsed?.data || !Array.isArray(parsed.data.transactions)) {
        return false;
      }
      dispatch({ type: 'restore', state: parsed.data });
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadDemoData = useCallback(() => {
    dispatch({ type: 'loadDemo', state: demoState() });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'clearAll' });
  }, []);

  const value = useMemo(
    () => ({
      state,
      addTransaction,
      editTransaction,
      deleteTransaction,
      importBatch,
      undoBatch,
      upsertBudget,
      deleteBudget,
      addAccount,
      editAccount,
      deleteAccount,
      addBill,
      deleteBill,
      markBillPaid,
      upsertCardDue,
      payCardDue,
      setMerchantOverride,
      setNotSubscription,
      reassignAccountHint,
      addGoal,
      editGoal,
      deleteGoal,
      setAppLock,
      setOnboarded,
      exportBackup,
      restoreBackup,
      loadDemoData,
      clearAll,
    }),
    [
      state,
      addTransaction,
      editTransaction,
      deleteTransaction,
      importBatch,
      undoBatch,
      upsertBudget,
      deleteBudget,
      addAccount,
      editAccount,
      deleteAccount,
      addBill,
      deleteBill,
      markBillPaid,
      upsertCardDue,
      payCardDue,
      setMerchantOverride,
      setNotSubscription,
      reassignAccountHint,
      addGoal,
      editGoal,
      deleteGoal,
      setAppLock,
      setOnboarded,
      exportBackup,
      restoreBackup,
      loadDemoData,
      clearAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

/** Current balance of an account: opening balance plus all its transactions. */
export function accountBalanceFils(state: AppState, accountId: string): number {
  const account = state.accounts.find((a) => a.id === accountId);
  let balance = account?.openingFils ?? 0;
  for (const t of state.transactions) {
    if (t.accountId !== accountId) continue;
    balance += t.type === 'income' ? t.amountFils : -t.amountFils;
  }
  return balance;
}

export function netWorthFils(state: AppState): number {
  return state.accounts.reduce((sum, a) => sum + accountBalanceFils(state, a.id), 0);
}

/** Net worth as of end-of-day on the given ISO date. */
export function netWorthAtDate(state: AppState, dateISO: string): number {
  let total = state.accounts.reduce((sum, a) => sum + a.openingFils, 0);
  for (const t of state.transactions) {
    if (t.date > dateISO) continue;
    total += t.type === 'income' ? t.amountFils : -t.amountFils;
  }
  return total;
}
