import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InsightCard } from '@/components/insight-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionRow } from '@/components/transaction-row';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { formatAED, greetingForHour, monthKey, monthLabel } from '@/lib/format';
import { buildInsights, spentInMonthForCategory, summarizeMonth } from '@/lib/insights';
import { netWorthFils, useStore } from '@/lib/store';

const TAB_BAR_CLEARANCE = 110;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state } = useStore();

  const now = new Date();
  const key = monthKey(now);

  const summary = useMemo(() => summarizeMonth(state.transactions, key), [state.transactions, key]);
  const insights = useMemo(
    () => buildInsights(state.transactions, state.budgets, key, now).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions, state.budgets, key],
  );
  const netWorth = useMemo(() => netWorthFils(state), [state]);
  const recent = state.transactions.slice(0, 5);

  const topBudgets = useMemo(() => {
    return state.budgets
      .map((b) => ({
        budget: b,
        spent: spentInMonthForCategory(state.transactions, key, b.category),
      }))
      .sort((a, b) => b.spent / b.budget.limitFils - a.spent / a.budget.limitFils)
      .slice(0, 3);
  }, [state.budgets, state.transactions, key]);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.headerRow}>
            <View>
              <ThemedText type="small" themeColor="textSecondary">
                {greetingForHour(now.getHours())} 👋
              </ThemedText>
              <ThemedText style={styles.headerTitle}>Your money at a glance</ThemedText>
            </View>
            <View style={[styles.monthChip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {monthLabel(key, true)}
              </ThemedText>
            </View>
          </Animated.View>

          {/* Balance hero card */}
          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <View style={styles.hero}>
              <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#0E9F7F" />
                    <Stop offset="0.55" stopColor="#0B6E59" />
                    <Stop offset="1" stopColor="#0A3F35" />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" rx={Radius.xl} fill="url(#heroGrad)" />
              </Svg>
              <ThemedText type="small" style={styles.heroLabel}>
                TOTAL BALANCE
              </ThemedText>
              <ThemedText style={styles.heroAmount}>{formatAED(netWorth, { decimals: false })}</ThemedText>
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                    <Icon name="arrow-down" size={16} color="#8CF5D3" />
                  </View>
                  <View>
                    <ThemedText type="small" style={styles.heroStatLabel}>Income</ThemedText>
                    <ThemedText type="smallBold" style={styles.heroStatValue}>
                      {formatAED(summary.incomeFils, { decimals: false })}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                  <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                    <Icon name="arrow-up" size={16} color="#FFC9CF" />
                  </View>
                  <View>
                    <ThemedText type="small" style={styles.heroStatLabel}>Spent</ThemedText>
                    <ThemedText type="smallBold" style={styles.heroStatValue}>
                      {formatAED(summary.expenseFils, { decimals: false })}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Insights carousel */}
          {insights.length > 0 && (
            <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Icon name="spark" size={18} color={theme.gold} />
                  <ThemedText type="smallBold">Smart insights</ThemedText>
                </View>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  onPress={() => router.push('/stats')}>
                  See analysis
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

          {/* Budgets snapshot */}
          {topBudgets.length > 0 && (
            <Animated.View entering={FadeInDown.delay(240).duration(400)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="smallBold">Budgets</ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  onPress={() => router.push('/budgets')}>
                  Manage
                </ThemedText>
              </View>
              <Card style={styles.budgetCard}>
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
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatAED(spent, { decimals: false })} / {formatAED(budget.limitFils, { decimals: false })}
                        </ThemedText>
                      </View>
                      <ProgressBar
                        ratio={ratio}
                        color={over ? theme.expense : ratio >= 0.85 ? theme.warning : meta.color}
                      />
                    </View>
                  );
                })}
              </Card>
            </Animated.View>
          )}

          {/* Recent transactions */}
          <Animated.View entering={FadeInDown.delay(320).duration(400)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="smallBold">Recent activity</ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                onPress={() => router.push('/transactions')}>
                See all
              </ThemedText>
            </View>
            <Card style={styles.txCard}>
              {recent.map((t, i) => (
                <View key={t.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                  <TransactionRow
                    transaction={t}
                    account={state.accounts.find((a) => a.id === t.accountId)}
                    onPress={() => router.push('/transactions')}
                  />
                </View>
              ))}
              {recent.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  No transactions yet. Tap + to add your first one.
                </ThemedText>
              )}
            </Card>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  monthChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    overflow: 'hidden',
    gap: Spacing.one,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.5,
    fontSize: 12,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 46,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.three,
    gap: Spacing.three,
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  heroStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 16,
  },
  heroStatValue: {
    color: '#FFFFFF',
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.25)',
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
    gap: Spacing.two,
  },
  insightScroll: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  budgetCard: {
    gap: Spacing.three,
  },
  budgetRow: {
    gap: Spacing.one,
  },
  budgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  txCard: {
    paddingVertical: Spacing.one,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44 + Spacing.three,
  },
  empty: {
    paddingVertical: Spacing.three,
    textAlign: 'center',
  },
});
