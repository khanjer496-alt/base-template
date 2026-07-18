import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import { generateSeedTransactions, SEED_ACCOUNTS, SEED_BUDGETS } from '@/lib/seed';
import type { Account, AppState, Bill, Budget, Transaction } from '@/lib/types';

const STORAGE_KEY = 'wafra/state/v1';

const EMPTY_STATE: AppState = {
  hydrated: false,
  accounts: [],
  transactions: [],
  budgets: [],
  bills: [],
  userName: 'there',
  appLock: false,
};

type Action =
  | { type: 'hydrate'; state: Partial<Omit<AppState, 'hydrated'>> }
  | { type: 'addTransaction'; transaction: Transaction }
  | { type: 'deleteTransaction'; id: string }
  | { type: 'upsertBudget'; budget: Budget }
  | { type: 'deleteBudget'; category: Budget['category'] }
  | { type: 'addAccount'; account: Account }
  | { type: 'deleteAccount'; id: string }
  | { type: 'addBill'; bill: Bill }
  | { type: 'deleteBill'; id: string }
  | { type: 'markBillPaid'; id: string; month: string; transaction: Transaction }
  | { type: 'setAppLock'; enabled: boolean }
  | { type: 'setUserName'; name: string }
  | { type: 'loadDemo'; state: Partial<Omit<AppState, 'hydrated'>> }
  | { type: 'clearAll' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
    case 'loadDemo':
      // Merge over defaults so states saved by older app versions stay valid.
      return { ...EMPTY_STATE, ...action.state, hydrated: true };
    case 'addTransaction': {
      const transactions = [action.transaction, ...state.transactions].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      );
      return { ...state, transactions };
    }
    case 'deleteTransaction':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };
    case 'upsertBudget': {
      const others = state.budgets.filter((b) => b.category !== action.budget.category);
      return { ...state, budgets: [...others, action.budget] };
    }
    case 'deleteBudget':
      return { ...state, budgets: state.budgets.filter((b) => b.category !== action.category) };
    case 'addAccount':
      return { ...state, accounts: [...state.accounts, action.account] };
    case 'deleteAccount':
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.id),
        transactions: state.transactions.filter((t) => t.accountId !== action.id),
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
      const transactions = [action.transaction, ...state.transactions].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      );
      return { ...state, bills, transactions };
    }
    case 'setAppLock':
      return { ...state, appLock: action.enabled };
    case 'setUserName':
      return { ...state, userName: action.name };
    case 'clearAll':
      return { ...EMPTY_STATE, hydrated: true, accounts: [SEED_ACCOUNTS[2]] };
    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  upsertBudget: (b: Budget) => void;
  deleteBudget: (category: Budget['category']) => void;
  addAccount: (a: Omit<Account, 'id'>) => void;
  deleteAccount: (id: string) => void;
  addBill: (b: Omit<Bill, 'id' | 'paidMonths'>) => void;
  deleteBill: (id: string) => void;
  markBillPaid: (id: string, month: string, transaction: Omit<Transaction, 'id'>) => void;
  setAppLock: (enabled: boolean) => void;
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
    userName: 'there',
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY_STATE);
  const skippedFirstPersist = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Omit<AppState, 'hydrated'>;
          dispatch({ type: 'hydrate', state: parsed });
        } else {
          dispatch({ type: 'hydrate', state: demoState() });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'hydrate', state: demoState() });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!skippedFirstPersist.current) {
      skippedFirstPersist.current = true;
    }
    const { hydrated: _hydrated, ...toSave } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [state]);

  const addTransaction = useCallback((t: Omit<Transaction, 'id'>) => {
    dispatch({
      type: 'addTransaction',
      transaction: { ...t, id: `tx-${Date.now()}-${Math.floor(Math.random() * 1e6)}` },
    });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    dispatch({ type: 'deleteTransaction', id });
  }, []);

  const upsertBudget = useCallback((budget: Budget) => {
    dispatch({ type: 'upsertBudget', budget });
  }, []);

  const deleteBudget = useCallback((category: Budget['category']) => {
    dispatch({ type: 'deleteBudget', category });
  }, []);

  const addAccount = useCallback((a: Omit<Account, 'id'>) => {
    dispatch({
      type: 'addAccount',
      account: { ...a, id: `acc-${Date.now()}-${Math.floor(Math.random() * 1e6)}` },
    });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    dispatch({ type: 'deleteAccount', id });
  }, []);

  const addBill = useCallback((b: Omit<Bill, 'id' | 'paidMonths'>) => {
    dispatch({
      type: 'addBill',
      bill: { ...b, id: `bill-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, paidMonths: [] },
    });
  }, []);

  const deleteBill = useCallback((id: string) => {
    dispatch({ type: 'deleteBill', id });
  }, []);

  const markBillPaid = useCallback(
    (id: string, month: string, transaction: Omit<Transaction, 'id'>) => {
      dispatch({
        type: 'markBillPaid',
        id,
        month,
        transaction: {
          ...transaction,
          id: `tx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        },
      });
    },
    [],
  );

  const setAppLock = useCallback((enabled: boolean) => {
    dispatch({ type: 'setAppLock', enabled });
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
      deleteTransaction,
      upsertBudget,
      deleteBudget,
      addAccount,
      deleteAccount,
      addBill,
      deleteBill,
      markBillPaid,
      setAppLock,
      loadDemoData,
      clearAll,
    }),
    [
      state,
      addTransaction,
      deleteTransaction,
      upsertBudget,
      deleteBudget,
      addAccount,
      deleteAccount,
      addBill,
      deleteBill,
      markBillPaid,
      setAppLock,
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
