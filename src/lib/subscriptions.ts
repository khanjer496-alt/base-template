import { toISODate } from '@/lib/format';
import type { CategoryId, Transaction } from '@/lib/types';

export type Cadence = 'weekly' | 'monthly' | 'yearly';

/**
 * subscription — cancellable online/lifestyle services (streaming, apps, gym);
 * utility — recurring DEWA/telecom-style bills; housing — rent;
 * commitment — anything else that recurs (suppliers, fees, transfers to people).
 * Kept separate so "subscriptions total" only counts what you could cancel.
 */
export type RecurringGroup = 'subscription' | 'utility' | 'housing' | 'commitment';

export interface Subscription {
  title: string;
  category: CategoryId;
  group: RecurringGroup;
  cadence: Cadence;
  avgAmountFils: number;
  lastAmountFils: number;
  lastChargedISO: string;
  nextExpectedISO: string;
  chargeCount: number;
  /** Latest charge is >10% above the average of prior charges. */
  priceIncreased: boolean;
  /** Monthly-equivalent cost for totals (yearly/12, weekly*4.33). */
  monthlyEquivalentFils: number;
}

interface CadenceWindow {
  cadence: Cadence;
  minDays: number;
  maxDays: number;
  typicalDays: number;
}

const WINDOWS: CadenceWindow[] = [
  { cadence: 'weekly', minDays: 6, maxDays: 8, typicalDays: 7 },
  { cadence: 'monthly', minDays: 26, maxDays: 35, typicalDays: 30 },
  { cadence: 'yearly', minDays: 350, maxDays: 380, typicalDays: 365 },
];

/**
 * Merchants that are subscriptions by nature: one observed interval (or even a
 * single charge for monthly staples) is enough to surface them.
 */
const KNOWN_SUBSCRIPTION_MERCHANTS =
  /netflix|spotify|anghami|osn|shahid|starz|youtube|yt premium|apple\.com|apple services|icloud|google one|google storage|amazon prime|prime video|openai|chat\s*gpt|claude|anthropic|real-?debrid|disney|hbo|deezer|audible|kindle|linkedin|dropbox|adobe|canva|microsoft 365|office 365|discord|notion|github|telegram premium|xbox game pass|playstation plus|psn plus|fitness first|gymnation|fitness time|classpass|etisalat postpaid|du postpaid|home internet/i;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000,
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Categories where a recurring charge can plausibly BE a subscription service.
 * A recurring supplier invoice or school fee is a commitment, not a Netflix.
 */
const SUBSCRIPTION_CATEGORIES = new Set<CategoryId>(['entertainment', 'shopping', 'health']);

/**
 * Real subscription detection: per-merchant charge cadence with amount
 * stability, boosted by a known-subscription merchant list. Merchants the
 * user marked "not a subscription" are skipped entirely.
 */
export function detectSubscriptions(
  transactions: Transaction[],
  notSubscriptions: string[] = [],
): Subscription[] {
  const dismissed = new Set(notSubscriptions.map((s) => s.trim().toLowerCase()));
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.isTransfer) continue;
    const k = t.title.trim().toLowerCase();
    if (!k || dismissed.has(k)) continue;
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }

  const subs: Subscription[] = [];
  for (const txs of groups.values()) {
    txs.sort((a, b) => (a.date < b.date ? -1 : 1));
    const title = txs[txs.length - 1].title;
    const known = KNOWN_SUBSCRIPTION_MERCHANTS.test(title);

    // Collapse same-day duplicates (split payments) into one charge.
    const charges: Transaction[] = [];
    for (const t of txs) {
      const prev = charges[charges.length - 1];
      if (prev && prev.date === t.date) prev.amountFils += t.amountFils;
      else charges.push({ ...t });
    }

    const amounts = charges.map((c) => c.amountFils);
    const mid = median(amounts);
    if (mid <= 0) continue;
    const stable = amounts.every((a) => a >= mid * 0.85 && a <= mid * 1.15);
    if (!stable && !known) continue;

    const gaps: number[] = [];
    for (let i = 1; i < charges.length; i++) {
      gaps.push(daysBetween(charges[i - 1].date, charges[i].date));
    }

    let window: CadenceWindow | null = null;
    if (gaps.length > 0) {
      for (const w of WINDOWS) {
        const inWindow = gaps.filter((g) => g >= w.minDays && g <= w.maxDays).length;
        if (inWindow >= Math.max(1, Math.ceil(gaps.length * 0.6))) {
          window = w;
          break;
        }
      }
    }

    const requiredIntervals = known ? 1 : 2;
    if (!window || gaps.length < requiredIntervals) {
      // Known merchants with a single charge still count as monthly.
      if (known && charges.length >= 1) {
        window = WINDOWS[1];
      } else {
        continue;
      }
    }

    const last = charges[charges.length - 1];
    const priorAmounts = amounts.slice(0, -1);
    const priorAvg = priorAmounts.length
      ? priorAmounts.reduce((s, a) => s + a, 0) / priorAmounts.length
      : last.amountFils;
    const avg = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    const monthlyEquivalentFils =
      window.cadence === 'monthly'
        ? avg
        : window.cadence === 'weekly'
          ? Math.round(avg * 4.33)
          : Math.round(avg / 12);

    const group: RecurringGroup =
      last.category === 'rent'
        ? 'housing'
        : last.category === 'utilities' || last.category === 'telecom'
          ? 'utility'
          : known || SUBSCRIPTION_CATEGORIES.has(last.category)
            ? 'subscription'
            : 'commitment';

    subs.push({
      title,
      category: last.category,
      group,
      cadence: window.cadence,
      avgAmountFils: avg,
      lastAmountFils: last.amountFils,
      lastChargedISO: last.date,
      nextExpectedISO: addDays(last.date, window.typicalDays),
      chargeCount: charges.length,
      priceIncreased: priorAmounts.length > 0 && last.amountFils > priorAvg * 1.1,
      monthlyEquivalentFils,
    });
  }

  subs.sort((a, b) => b.monthlyEquivalentFils - a.monthlyEquivalentFils);
  return subs;
}

export function subscriptionsMonthlyTotal(subs: Subscription[]): number {
  return subs.reduce((s, sub) => s + sub.monthlyEquivalentFils, 0);
}

/** Only the cancellable online/lifestyle subscriptions. */
export function trueSubscriptions(subs: Subscription[]): Subscription[] {
  return subs.filter((s) => s.group === 'subscription');
}

/** Rent + utilities/telecom recurring commitments. */
export function fixedCommitments(subs: Subscription[]): Subscription[] {
  return subs.filter((s) => s.group !== 'subscription');
}

/** Days until the next expected charge; negative if the date passed. */
export function daysUntilNext(sub: Subscription, today: Date): number {
  return daysBetween(toISODate(today), sub.nextExpectedISO);
}
