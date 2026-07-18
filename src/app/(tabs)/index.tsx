import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InsightCard } from '@/components/insight-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionRow } from '@/components/transaction-row';
import { CountUpAmount } from '@/components/ui/count-up';
import { Icon } from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  buildImportPlan,
  hasSmsPermission,
  isSmsScanningAvailable,
  requestSmsPermission,
  scanInbox,
} from '@/lib/auto-import';
import { billsForMonth } from '@/lib/bills';
import { openDues } from '@/lib/cards';
import { getCategory } from '@/lib/categories';
import { formatAED, greetingForHour, monthKey, monthLabel, shortDate } from '@/lib/format';
import { buildInsights, spentInMonthForCategory, summarizeMonth } from '@/lib/insights';
import { requestNotificationPermission, syncPaymentReminders } from '@/lib/notifications';
import { netWorthFils, useStore } from '@/lib/store';
import {
  detectSubscriptions,
  daysUntilNext,
  subscriptionsMonthlyTotal,
  trueSubscriptions,
} from '@/lib/subscriptions';

const TAB_BAR_CLEARANCE = 110;

// Once per app session: auto-import + notification sync.
let autoImportRan = false;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { state, importBatch, undoBatch } = useStore();

  const now = useMemo(() => new Date(), []);
  const key = monthKey(now);
  const [refreshing, setRefreshing] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  const summary = useMemo(() => summarizeMonth(state.transactions, key), [state.transactions, key]);
  const insights = useMemo(
    () => buildInsights(state.transactions, state.budgets, key, now).slice(0, 5),
    [state.transactions, state.budgets, key, now],
  );
  const netWorth = useMemo(() => netWorthFils(state), [state]);
  const recent = useMemo(
    () => state.transactions.filter((t) => !t.isTransfer).slice(0, 5),
    [state.transactions],
  );
  const dues = useMemo(() => openDues(state, now), [state, now]);
  const subs = useMemo(
    () => trueSubscriptions(detectSubscriptions(state.transactions)),
    [state.transactions],
  );
  const nextSub = useMemo(() => {
    const upcoming = subs
      .map((s) => ({ s, d: daysUntilNext(s, now) }))
      .filter((x) => x.d >= 0)
      .sort((a, b) => a.d - b.d);
    return upcoming[0] ?? null;
  }, [subs, now]);

  const upcomingBills = useMemo(
    () =>
      billsForMonth(state.bills, state.transactions, now)
        .filter((b) => b.status !== 'paid')
        .slice(0, 3),
    [state.bills, state.transactions, now],
  );

  const topBudgets = useMemo(() => {
    return state.budgets
      .map((b) => ({
        budget: b,
        spent: spentInMonthForCategory(state.transactions, key, b.category),
      }))
      .sort((a, b) => b.spent / b.budget.limitFils - a.spent / a.budget.limitFils)
      .slice(0, 3);
  }, [state.budgets, state.transactions, key]);

  const runAutoImport = useCallback(
    async (interactive: boolean) => {
      if (!isSmsScanningAvailable()) return;
      let granted = await hasSmsPermission();
      if (!granted && interactive) granted = await requestSmsPermission();
      if (!granted) {
        setNeedsPermission(true);
        return;
      }
      setNeedsPermission(false);
      const sinceMs = state.lastScanTs > 0 ? state.lastScanTs + 1 : 0;
      const { parsed, newestTs } = await scanInbox(sinceMs, state.merchantOverrides);
      const plan = buildImportPlan(parsed, state, newestTs);
      if (plan.txCount === 0 && plan.dueCount === 0) {
        if (interactive) toast.show('Up to date. No new bank messages.');
        return;
      }
      const ids = importBatch(plan.batch);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      toast.show(
        `Imported ${plan.txCount} transaction${plan.txCount === 1 ? '' : 's'}${plan.newAccountCount > 0 ? ` · ${plan.newAccountCount} new card${plan.newAccountCount === 1 ? '' : 's'}` : ''}`,
        [
          { label: 'Undo', onPress: () => undoBatch(ids) },
          { label: 'Review', onPress: () => router.push('/transactions?source=sms') },
        ],
      );
    },
    [state, importBatch, undoBatch, toast, router],
  );

  // Silent auto-import + reminder sync, once per session.
  useEffect(() => {
    if (!state.hydrated || autoImportRan) return;
    autoImportRan = true;
    (async () => {
      try {
        await runAutoImport(false);
        await requestNotificationPermission();
        await syncPaymentReminders(state);
      } catch {
        // Best-effort; manual import still available.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runAutoImport(true);
      await syncPaymentReminders(state);
    } finally {
      setRefreshing(false);
    }
  }, [runAutoImport, state]);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }>
          {/* Typographic hero: no card, no gradient */}
          <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
            <View style={styles.heroTopRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {greetingForHour(now.getHours())} · {monthLabel(key, true)}
              </ThemedText>
              <Pressable onPress={() => router.push('/stats')} hitSlop={8}>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                  Report
                </ThemedText>
              </Pressable>
            </View>
            <CountUpAmount fils={netWorth} type="display" />
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <View style={[styles.heroDot, { backgroundColor: theme.income }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  In{' '}
                  <ThemedText type="smallBold" tabular style={{ color: theme.income }}>
                    {formatAED(summary.incomeFils, { decimals: false })}
                  </ThemedText>
                </ThemedText>
              </View>
              <View style={styles.heroStat}>
                <View style={[styles.heroDot, { backgroundColor: theme.expense }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  Out{' '}
                  <ThemedText type="smallBold" tabular style={{ color: theme.expense }}>
                    {formatAED(summary.expenseFils, { decimals: false })}
                  </ThemedText>
                </ThemedText>
              </View>
            </View>
          </Animated.View>

          {/* Enable-scanning nudge (first run without permission only) */}
          {needsPermission && (
            <Animated.View entering={FadeInDown.duration(350)}>
              <Pressable
                onPress={() => runAutoImport(true)}
                style={[styles.permissionRow, { borderColor: theme.primary }]}>
                <Icon name="spark" size={18} color={theme.primary} />
                <View style={styles.permissionText}>
                  <ThemedText type="smallBold">Turn on automatic tracking</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Wafra reads bank SMS on this device only
                  </ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            </Animated.View>
          )}

          {/* Card dues strip */}
          {dues.length > 0 && (
            <Animated.View entering={FadeInDown.delay(60).duration(350)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="micro" themeColor="textSecondary">Card payments</ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  onPress={() => router.push('/wallet')}>
                  Wallet
                </ThemedText>
              </View>
              {dues.slice(0, 2).map(({ due, status, daysLeft, remainingFils }) => {
                const account = state.accounts.find((a) => a.id === due.accountId);
                const urgent = status === 'urgent' || status === 'overdue';
                return (
                  <Pressable
                    key={due.id}
                    onPress={() => router.push('/wallet')}
                    style={styles.dueRow}>
                    <ThemedText type="small" style={styles.dueName} numberOfLines={1}>
                      💳 {account?.name ?? 'Card'}
                    </ThemedText>
                    <ThemedText
                      type="small"
                      style={{ color: urgent ? theme.expense : theme.textSecondary }}>
                      {status === 'overdue'
                        ? `${-daysLeft}d overdue`
                        : `pay by ${shortDate(due.dueDate)}`}
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      tabular
                      style={[styles.dueAmount, urgent && { color: theme.expense }]}>
                      {formatAED(remainingFils, { decimals: false })}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </Animated.View>
          )}

          {/* Insights carousel */}
          {insights.length > 0 && (
            <Animated.View entering={FadeInDown.delay(100).duration(350)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Icon name="spark" size={16} color={theme.gold} />
                  <ThemedText type="micro" themeColor="textSecondary">Insights</ThemedText>
                </View>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  onPress={() => router.push('/stats')}>
                  All
                </ThemedText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.insightScroll}>
                {insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} width={230} />
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Subscriptions line */}
          {subs.length > 0 && (
            <Animated.View entering={FadeInDown.delay(140).duration(350)}>
              <Pressable onPress={() => router.push('/bills')} style={styles.subsRow}>
                <ThemedText type="small">
                  🔁 {subs.length} subscription{subs.length === 1 ? '' : 's'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.subsNext}>
                  {nextSub ? `${nextSub.s.title} in ${nextSub.d}d` : ''}
                </ThemedText>
                <ThemedText type="smallBold" tabular>
                  {formatAED(subscriptionsMonthlyTotal(subs), { decimals: false })}/mo
                </ThemedText>
              </Pressable>
            </Animated.View>
          )}

          {/* Upcoming bills */}
          {upcomingBills.length > 0 && (
            <Animated.View entering={FadeInDown.delay(180).duration(350)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="micro" themeColor="textSecondary">Upcoming bills</ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  onPress={() => router.push('/bills')}>
                  Manage
                </ThemedText>
              </View>
              {upcomingBills.map(({ bill, status, daysLeft }) => (
                <Pressable
                  key={bill.id}
                  onPress={() => router.push('/bills')}
                  style={styles.billRow}>
                  <ThemedText type="small" style={styles.billTitle} numberOfLines={1}>
                    {getCategory(bill.category).emoji}  {bill.title}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{
                      color:
                        status === 'overdue'
                          ? theme.expense
                          : status === 'due-soon'
                            ? theme.warning
                            : theme.textSecondary,
                    }}>
                    {status === 'overdue'
                      ? `${-daysLeft}d overdue`
                      : daysLeft === 0
                        ? 'today'
                        : `in ${daysLeft}d`}
                  </ThemedText>
                  <ThemedText type="smallBold" tabular style={styles.billAmount}>
                    {formatAED(bill.amountFils, { decimals: false })}
                  </ThemedText>
                </Pressable>
              ))}
            </Animated.View>
          )}

          {/* Budgets */}
          {topBudgets.length > 0 && (
            <Animated.View entering={FadeInDown.delay(220).duration(350)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="micro" themeColor="textSecondary">Budgets</ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  onPress={() => router.push('/budgets')}>
                  Manage
                </ThemedText>
              </View>
              {topBudgets.map(({ budget, spent }) => {
                const meta = getCategory(budget.category);
                const ratio = spent / budget.limitFils;
                const over = ratio >= 1;
                return (
                  <View key={budget.category} style={styles.budgetRow}>
                    <View style={styles.budgetTop}>
                      <ThemedText type="small">
                        {meta.emoji}  {meta.label}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" tabular>
                        {formatAED(spent, { decimals: false })} / {formatAED(budget.limitFils, { decimals: false })}
                      </ThemedText>
                    </View>
                    <ProgressBar
                      ratio={ratio}
                      color={over ? theme.expense : ratio >= 0.85 ? theme.warning : meta.color}
                      height={5}
                    />
                  </View>
                );
              })}
            </Animated.View>
          )}

          {/* Recent activity */}
          <Animated.View entering={FadeInDown.delay(260).duration(350)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="micro" themeColor="textSecondary">Recent activity</ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                onPress={() => router.push('/transactions')}>
                See all
              </ThemedText>
            </View>
            <View>
              {recent.map((t, i) => (
                <View
                  key={t.id}
                  style={
                    i > 0
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder }
                      : undefined
                  }>
                  <TransactionRow
                    transaction={t}
                    account={state.accounts.find((a) => a.id === t.accountId)}
                    onPress={() => router.push('/transactions')}
                  />
                </View>
              ))}
              {recent.length === 0 && (
                <View style={styles.emptyRecent}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing yet. Tap + to add a transaction, or pull down to scan your SMS.
                  </ThemedText>
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  safe: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: Spacing.four,
  },
  hero: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroStats: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  permissionText: {
    flex: 1,
    gap: 1,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },
  dueName: {
    flex: 1,
  },
  dueAmount: {
    minWidth: 84,
    textAlign: 'right',
  },
  insightScroll: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  subsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  subsNext: {
    flex: 1,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },
  billTitle: {
    flex: 1,
  },
  billAmount: {
    minWidth: 84,
    textAlign: 'right',
  },
  budgetRow: {
    gap: Spacing.one + 1,
    paddingVertical: Spacing.one,
  },
  budgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emptyRecent: {
    paddingVertical: Spacing.three,
  },
});
