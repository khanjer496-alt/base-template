import { getCategory } from '@/lib/categories';
import { daysInMonth, formatAED, monthKey, monthLabel, shiftMonthKey } from '@/lib/format';
import { detectSubscriptions, subscriptionsMonthlyTotal, trueSubscriptions } from '@/lib/subscriptions';
import type { Budget, CategoryId, Transaction } from '@/lib/types';

export interface MonthSummary {
  incomeFils: number;
  expenseFils: number;
  byCategory: { category: CategoryId; totalFils: number; share: number }[];
}

export function summarizeMonth(transactions: Transaction[], key: string): MonthSummary {
  let incomeFils = 0;
  let expenseFils = 0;
  const catTotals = new Map<CategoryId, number>();

  for (const t of transactions) {
    if (t.isTransfer) continue; // card payments move money, they aren't income/spending
    if (monthKey(t.date) !== key) continue;
    if (t.type === 'income') {
      incomeFils += t.amountFils;
    } else {
      expenseFils += t.amountFils;
      catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amountFils);
    }
  }

  const byCategory = [...catTotals.entries()]
    .map(([category, totalFils]) => ({
      category,
      totalFils,
      share: expenseFils > 0 ? totalFils / expenseFils : 0,
    }))
    .sort((a, b) => b.totalFils - a.totalFils);

  return { incomeFils, expenseFils, byCategory };
}

export function spentInMonthForCategory(
  transactions: Transaction[],
  key: string,
  category: CategoryId,
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.isTransfer) continue;
    if (t.type === 'expense' && t.category === category && monthKey(t.date) === key) {
      total += t.amountFils;
    }
  }
  return total;
}

export type InsightTone = 'positive' | 'warning' | 'neutral';

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: import('@/components/ui/icon').IconName;
  title: string;
  body: string;
}

/**
 * The analysis engine: turns the raw ledger into a ranked list of plain-language
 * observations about the selected month.
 */
export function buildInsights(
  transactions: Transaction[],
  budgets: Budget[],
  key: string,
  today: Date,
): Insight[] {
  const insights: Insight[] = [];
  const current = summarizeMonth(transactions, key);
  const prevKey = shiftMonthKey(key, -1);
  const previous = summarizeMonth(transactions, prevKey);
  const isCurrentMonth = key === monthKey(today);
  const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth(key);

  // Month-over-month spending change
  if (previous.expenseFils > 0 && current.expenseFils > 0) {
    if (isCurrentMonth) {
      const pace = current.expenseFils / dayOfMonth;
      const projected = pace * daysInMonth(key);
      const delta = (projected - previous.expenseFils) / previous.expenseFils;
      if (Math.abs(delta) >= 0.08) {
        const pct = Math.round(Math.abs(delta) * 100);
        insights.push({
          id: 'pace',
          tone: delta > 0 ? 'warning' : 'positive',
          icon: delta > 0 ? 'arrow-up-right' : 'arrow-down-right',
          title: delta > 0 ? `Trending ${pct}% higher` : `Trending ${pct}% lower`,
          body: `At today's pace you'll spend about ${formatAED(Math.round(projected), { decimals: false })} this month, vs ${formatAED(previous.expenseFils, { decimals: false })} in ${monthLabel(prevKey, true)}.`,
        });
      }
    } else {
      const delta = (current.expenseFils - previous.expenseFils) / previous.expenseFils;
      if (Math.abs(delta) >= 0.05) {
        const pct = Math.round(Math.abs(delta) * 100);
        insights.push({
          id: 'mom',
          tone: delta > 0 ? 'warning' : 'positive',
          icon: delta > 0 ? 'arrow-up-right' : 'arrow-down-right',
          title: `Spent ${pct}% ${delta > 0 ? 'more' : 'less'}`,
          body: `${formatAED(current.expenseFils, { decimals: false })} vs ${formatAED(previous.expenseFils, { decimals: false })} in ${monthLabel(prevKey, true)}.`,
        });
      }
    }
  }

  // Budget alerts
  for (const b of budgets) {
    const spent = spentInMonthForCategory(transactions, key, b.category);
    if (b.limitFils <= 0) continue;
    const ratio = spent / b.limitFils;
    const cat = getCategory(b.category);
    if (ratio >= 1) {
      insights.push({
        id: `budget-over-${b.category}`,
        tone: 'warning',
        icon: 'alert',
        title: `${cat.label} budget exceeded`,
        body: `${formatAED(spent, { decimals: false })} spent of your ${formatAED(b.limitFils, { decimals: false })} limit.`,
      });
    } else if (ratio >= 0.85 && isCurrentMonth) {
      insights.push({
        id: `budget-near-${b.category}`,
        tone: 'warning',
        icon: 'alert',
        title: `${cat.label} almost at limit`,
        body: `${Math.round(ratio * 100)}% used — ${formatAED(b.limitFils - spent, { decimals: false })} left for the month.`,
      });
    }
  }

  // Top category concentration
  const top = current.byCategory.filter((c) => c.category !== 'rent')[0];
  if (top && top.share >= 0.15) {
    const cat = getCategory(top.category);
    insights.push({
      id: 'top-category',
      tone: 'neutral',
      icon: cat.icon,
      title: `${cat.label} leads your spending`,
      body: `${formatAED(top.totalFils, { decimals: false })} — ${Math.round(top.share * 100)}% of this month's expenses.`,
    });
  }

  // Savings rate
  if (current.incomeFils > 0) {
    const rate = (current.incomeFils - current.expenseFils) / current.incomeFils;
    if (rate >= 0.2) {
      insights.push({
        id: 'savings',
        tone: 'positive',
        icon: 'leaf',
        title: `Saving ${Math.round(rate * 100)}% of income`,
        body: `${formatAED(current.incomeFils - current.expenseFils, { decimals: false })} kept aside so far this month. Keep it up!`,
      });
    } else if (rate < 0) {
      insights.push({
        id: 'overspend',
        tone: 'warning',
        icon: 'alert',
        title: 'Spending exceeds income',
        body: `Expenses are ${formatAED(current.expenseFils - current.incomeFils, { decimals: false })} above income this month.`,
      });
    }
  }

  // Largest single expense
  let largest: Transaction | null = null;
  for (const t of transactions) {
    if (t.isTransfer) continue;
    if (t.type === 'expense' && monthKey(t.date) === key && t.category !== 'rent') {
      if (!largest || t.amountFils > largest.amountFils) largest = t;
    }
  }
  if (largest && largest.amountFils >= 20_000) {
    insights.push({
      id: 'largest',
      tone: 'neutral',
      icon: 'diamond',
      title: 'Biggest purchase',
      body: `${largest.title} — ${formatAED(largest.amountFils, { decimals: false })} on ${largest.date.slice(8)}/${largest.date.slice(5, 7)}.`,
    });
  }

  // Subscription load + price increases (true subscriptions only — rent and
  // utilities are fixed commitments, not cancellable services)
  const subs = trueSubscriptions(detectSubscriptions(transactions));
  if (subs.length >= 2) {
    const monthly = subscriptionsMonthlyTotal(subs);
    if (current.incomeFils > 0 && monthly / current.incomeFils >= 0.08) {
      insights.push({
        id: 'subs-load',
        tone: 'warning',
        icon: 'repeat',
        title: `${subs.length} subscriptions cost ${formatAED(monthly, { decimals: false })}/mo`,
        body: `That's ${Math.round((monthly / current.incomeFils) * 100)}% of this month's income. Review them in Bills.`,
      });
    } else {
      insights.push({
        id: 'subs-total',
        tone: 'neutral',
        icon: 'repeat',
        title: `${subs.length} active subscriptions`,
        body: `About ${formatAED(monthly, { decimals: false })} per month combined.`,
      });
    }
  }
  const increased = subs.find((s) => s.priceIncreased);
  if (increased) {
    insights.push({
      id: `price-up-${increased.title}`,
      tone: 'warning',
      icon: 'arrow-up-right',
      title: `${increased.title} got pricier`,
      body: `Last charge ${formatAED(increased.lastAmountFils, { decimals: false })} vs the usual ${formatAED(increased.avgAmountFils, { decimals: false })}.`,
    });
  }

  // Average daily spend
  if (current.expenseFils > 0 && dayOfMonth > 0) {
    insights.push({
      id: 'daily',
      tone: 'neutral',
      icon: 'sun',
      title: 'Daily average',
      body: `You spend about ${formatAED(Math.round(current.expenseFils / dayOfMonth), { decimals: false })} per day this month.`,
    });
  }

  const toneRank: Record<InsightTone, number> = { warning: 0, positive: 1, neutral: 2 };
  insights.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
  return insights;
}
