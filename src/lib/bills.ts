import { daysInMonth, monthKey } from '@/lib/format';
import { guessCategory } from '@/lib/sms-parser';
import type { Bill, CategoryId, Transaction } from '@/lib/types';

export type BillStatus = 'paid' | 'overdue' | 'due-soon' | 'upcoming';

export interface BillWithStatus {
  bill: Bill;
  status: BillStatus;
  /** Days until due this month; negative when overdue. */
  daysLeft: number;
}

/** Status of each bill for the month containing `today`, sorted most urgent first. */
export function billsForMonth(bills: Bill[], today: Date): BillWithStatus[] {
  const key = monthKey(today);
  const lastDay = daysInMonth(key);

  const rows = bills.map((bill) => {
    const dueDay = Math.min(bill.dueDay, lastDay);
    const daysLeft = dueDay - today.getDate();
    let status: BillStatus;
    if (bill.paidMonths.includes(key)) status = 'paid';
    else if (daysLeft < 0) status = 'overdue';
    else if (daysLeft <= 5) status = 'due-soon';
    else status = 'upcoming';
    return { bill, status, daysLeft };
  });

  const rank: Record<BillStatus, number> = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.daysLeft - b.daysLeft);
  return rows;
}

export interface RecurringCandidate {
  title: string;
  category: CategoryId;
  avgAmountFils: number;
  /** Most common day of month the charge lands on. */
  typicalDay: number;
  monthsSeen: number;
}

/**
 * Finds merchants charged in 2+ distinct months with similar amounts —
 * likely subscriptions or recurring bills worth turning into reminders.
 */
export function detectRecurring(transactions: Transaction[]): RecurringCandidate[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const k = t.title.trim().toLowerCase();
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }

  const candidates: RecurringCandidate[] = [];
  for (const txs of groups.values()) {
    const months = new Set(txs.map((t) => monthKey(t.date)));
    if (months.size < 2) continue;

    const amounts = txs.map((t) => t.amountFils);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0 || max / min > 1.3) continue;

    // At most ~1 charge per month seen, otherwise it's a habit, not a bill.
    if (txs.length > months.size + 1) continue;

    const dayCounts = new Map<number, number>();
    for (const t of txs) {
      const day = Number(t.date.slice(8));
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    const typicalDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    candidates.push({
      title: txs[0].title,
      category: txs[0].category ?? guessCategory(txs[0].title, 'expense'),
      avgAmountFils: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length),
      typicalDay,
      monthsSeen: months.size,
    });
  }

  candidates.sort((a, b) => b.monthsSeen - a.monthsSeen || b.avgAmountFils - a.avgAmountFils);
  return candidates;
}
