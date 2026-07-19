import { toISODate } from '@/lib/format';
import type { AppState, CardDue } from '@/lib/types';

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

/** Open dues (not settled, not fully paid), most urgent first. */
export function openDues(state: AppState, today: Date): DueWithStatus[] {
  return state.cardDues
    .map((d) => dueWithStatus(state, d, today))
    .filter((d) => d.status !== 'settled')
    .sort((a, b) => a.daysLeft - b.daysLeft);
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
