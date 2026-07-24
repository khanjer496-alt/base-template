import { toISODate } from '@/lib/format';
import type { Account, AppState, CardDue } from '@/lib/types';

export type DueStatus = 'overdue' | 'urgent' | 'upcoming' | 'settled';

export interface DueWithStatus {
  due: CardDue;
  status: DueStatus;
  /** Days until dueDate; negative when overdue. */
  daysLeft: number;
  /** What is still owed on this statement after payments. */
  remainingFils: number;
  /** True while payments are below the statement's minimum due. */
  belowMinimum: boolean;
}

/**
 * What has been paid toward a due: explicit paidFils (manual "Mark paid")
 * plus card-payment transfers on that account dated on/after the statement.
 */
export function duePaidFils(state: AppState, due: CardDue): number {
  let paid = due.paidFils;
  // Statement date approximated as ~25 days before the due date.
  const stmtWindowStart = shiftISO(due.dueDate, -40);
  for (const t of state.transactions) {
    if (!t.isTransfer || t.accountId !== due.accountId || t.type !== 'income') continue;
    if (t.date >= stmtWindowStart && t.date <= shiftISO(due.dueDate, 20)) {
      paid += t.amountFils;
    }
  }
  return paid;
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function dueWithStatus(state: AppState, due: CardDue, today: Date): DueWithStatus {
  const todayISO = toISODate(today);
  const paid = duePaidFils(state, due);
  const remainingFils = Math.max(0, due.totalDueFils - paid);
  const msPerDay = 86400000;
  const daysLeft = Math.round(
    (new Date(`${due.dueDate}T12:00:00`).getTime() - new Date(`${todayISO}T12:00:00`).getTime()) /
      msPerDay,
  );

  let status: DueStatus;
  if (due.settledAt || remainingFils === 0) status = 'settled';
  else if (daysLeft < 0) status = 'overdue';
  else if (daysLeft <= 3) status = 'urgent';
  else status = 'upcoming';

  return {
    due,
    status,
    daysLeft,
    remainingFils,
    belowMinimum: paid < due.minDueFils && status !== 'settled',
  };
}

/** How long an unpaid due stays actionable. Past this it is stale history —
 *  the bank has issued a new statement (which replaces it) or it was paid
 *  through a channel that never texted us. Nagging forever helps nobody. */
const STALE_OVERDUE_DAYS = 30;

/** Open dues (not settled, on credit cards, not stale), most urgent first. */
export function openDues(state: AppState, today: Date): DueWithStatus[] {
  const creditIds = new Set(
    state.accounts.filter((a) => a.cardType === 'credit' && !a.archived).map((a) => a.id),
  );
  return state.cardDues
    .filter((d) => creditIds.has(d.accountId))
    .map((d) => dueWithStatus(state, d, today))
    .filter((d) => d.status !== 'settled' && d.daysLeft >= -STALE_OVERDUE_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * ISO date of the last known activity on an account: newest transaction or
 * the bank's latest snapshot SMS, whichever is later. Null = no history.
 */
export function accountLastActivityISO(state: AppState, accountId: string): string | null {
  let latest: string | null = null;
  for (const t of state.transactions) {
    if (t.accountId !== accountId) continue;
    if (!latest || t.date > latest) latest = t.date;
  }
  const acc = state.accounts.find((a) => a.id === accountId);
  if (acc?.snapshotTs) {
    const snapISO = toISODate(new Date(acc.snapshotTs));
    if (!latest || snapISO > latest) latest = snapISO;
  }
  return latest;
}

/** No charge and no bank SMS for this long = the card is expired or unused. */
export const DORMANT_AFTER_DAYS = 90;

/**
 * Hidden from the main lists: manually hidden, or silent for months. A
 * full-history scan resurrects every card the user ever owned; the dead ones
 * identify themselves by never texting again. Accounts with no history at all
 * (freshly added by hand) are left alone.
 */
export function isInactiveAccount(state: AppState, account: Account, today: Date): boolean {
  if (account.archived) return true;
  const last = accountLastActivityISO(state, account.id);
  if (!last) return false;
  const silentDays = Math.round(
    (new Date(`${toISODate(today)}T12:00:00`).getTime() - new Date(`${last}T12:00:00`).getTime()) /
      86400000,
  );
  return silentDays > DORMANT_AFTER_DAYS;
}

/** Display name for an auto-created card account. */
export function cardAccountName(last4: string, kind: 'credit' | 'debit' | 'account'): string {
  if (kind === 'credit') return `Credit Card •${last4}`;
  if (kind === 'debit') return `Debit Card •${last4}`;
  return `Account •${last4}`;
}

const HINT_COLORS = ['#60A5FA', '#F472B6', '#A78BFA', '#FB923C', '#22D3EE', '#4ADE80'];

export function colorForHint(last4: string): string {
  const n = Number(last4) || 0;
  return HINT_COLORS[n % HINT_COLORS.length];
}

/** UAE bank identities recognized from SMS sender IDs. */
const BANKS: { re: RegExp; name: string; color: string }[] = [
  { re: /enbd|emirates\s*nbd/i, name: 'Emirates NBD', color: '#2B4C9B' },
  { re: /\bfab\b|first\s*abu\s*dhabi/i, name: 'FAB', color: '#00A3E0' },
  { re: /adcb/i, name: 'ADCB', color: '#E4032E' },
  { re: /adib/i, name: 'ADIB', color: '#0E5AA7' },
  { re: /\bdib\b|dubai\s*islamic/i, name: 'DIB', color: '#00704A' },
  { re: /mashreq/i, name: 'Mashreq', color: '#FF5E00' },
  { re: /rak\s*bank/i, name: 'RAKBANK', color: '#D71920' },
  { re: /\bcbd\b/i, name: 'CBD', color: '#00857D' },
  { re: /hsbc/i, name: 'HSBC', color: '#DB0011' },
  { re: /emirates\s*islamic|\bei\b/i, name: 'Emirates Islamic', color: '#00843D' },
  { re: /\bsib\b|sharjah\s*islamic/i, name: 'Sharjah Islamic', color: '#006B54' },
  { re: /\bnbf\b/i, name: 'NBF', color: '#5C6670' },
  { re: /\bwio\b/i, name: 'Wio', color: '#C4F04A' },
  { re: /\bliv\b/i, name: 'Liv', color: '#00D3B9' },
  { re: /\bajman\s*bank/i, name: 'Ajman Bank', color: '#00747A' },
  { re: /\bcbi\b/i, name: 'CBI', color: '#7A2048' },
];

/** Resolve a bank identity from an SMS sender ID (e.g. "AD-ADCB", "ENBD"). */
export function bankFromSender(sender: string | undefined): { name: string; color: string } | null {
  if (!sender) return null;
  for (const b of BANKS) {
    if (b.re.test(sender)) return { name: b.name, color: b.color };
  }
  return null;
}
