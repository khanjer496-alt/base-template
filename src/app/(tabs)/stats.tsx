import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InsightCard } from '@/components/insight-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BarChart } from '@/components/ui/bar-chart';
import { Card } from '@/components/ui/card';
import { DonutChart } from '@/components/ui/donut-chart';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import {
  daysInMonth,
  formatAED,
  formatCompactAED,
  monthKey,
  monthLabel,
  shiftMonthKey,
} from '@/lib/format';
import { buildInsights, summarizeMonth } from '@/lib/insights';
import { useStore } from '@/lib/store';

const TAB_BAR_CLEARANCE = 110;

export default function StatsScreen() {
  const theme = useTheme();
  const { state } = useStore();
  const now = new Date();
  const currentKey = monthKey(now);
  const [key, setKey] = useState(currentKey);

  const summary = useMemo(() => summarizeMonth(state.transactions, key), [state.transactions, key]);
  const insights = useMemo(
    () => buildInsights(state.transactions, state.budgets, key, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions, state.budgets, key],
  );

  const trend = useMemo(() => {
    const months: { label: string; income: number; expense: number; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const k = shiftMonthKey(currentKey, -i);
      const s = summarizeMonth(state.transactions, k);
      months.push({
        key: k,
        label: monthLabel(k, true).split(' ')[0],
        income: s.incomeFils,
        expense: s.expenseFils,
      });
    }
    return months;
  }, [state.transactions, currentKey]);

  const highlightIndex = trend.findIndex((m) => m.key === key);
  const isCurrent = key === currentKey;
  const elapsedDays = isCurrent ? now.getDate() : daysInMonth(key);
  const dailyAvg = elapsedDays > 0 ? Math.round(summary.expenseFils / elapsedDays) : 0;
  const projected = isCurrent ? dailyAvg * daysInMonth(key) : summary.expenseFils;
  const savings = summary.incomeFils - summary.expenseFils;

  const segments = summary.byCategory.map((c) => ({
    value: c.totalFils,
    color: getCategory(c.category).color,
  }));

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Month navigator */}
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => setKey(shiftMonthKey(key, -1))}
              style={[styles.navBtn, { backgroundColor: theme.backgroundSelected }]}>
              <Icon name="chevron-left" size={18} color={theme.text} />
            </Pressable>
            <View style={styles.monthTitleWrap}>
              <ThemedText type="smallBold" style={styles.monthTitle}>
                {monthLabel(key)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Spending analysis
              </ThemedText>
            </View>
            <Pressable
              disabled={isCurrent}
              onPress={() => setKey(shiftMonthKey(key, 1))}
              style={[
                styles.navBtn,
                { backgroundColor: theme.backgroundSelected, opacity: isCurrent ? 0.35 : 1 },
              ]}>
              <Icon name="chevron-right" size={18} color={theme.text} />
            </Pressable>
          </View>

          {/* Donut breakdown */}
          <Animated.View entering={FadeInDown.duration(400)}>
            <Card style={styles.donutCard}>
              <DonutChart segments={segments} trackColor={theme.track}>
                <ThemedText type="small" themeColor="textSecondary">
                  Spent
                </ThemedText>
                <ThemedText style={styles.donutAmount}>
                  {formatAED(summary.expenseFils, { decimals: false })}
                </ThemedText>
              </DonutChart>

              <View style={styles.legend}>
                {summary.byCategory.slice(0, 6).map((c) => {
                  const meta = getCategory(c.category);
                  return (
                    <View key={c.category} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                      <ThemedText type="small" style={styles.legendLabel} numberOfLines={1}>
                        {meta.label}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {Math.round(c.share * 100)}%
                      </ThemedText>
                      <ThemedText type="smallBold" style={styles.legendAmount}>
                        {formatAED(c.totalFils, { decimals: false })}
                      </ThemedText>
                    </View>
                  );
                })}
                {summary.byCategory.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    No expenses recorded for this month.
                  </ThemedText>
                )}
              </View>
            </Card>
          </Animated.View>

          {/* Key numbers */}
          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.statRow}>
            <Card style={styles.statCard}>
              <ThemedText type="small" themeColor="textSecondary">Daily avg</ThemedText>
              <ThemedText type="smallBold" style={styles.statValue}>
                {formatAED(dailyAvg, { decimals: false })}
              </ThemedText>
            </Card>
            <Card style={styles.statCard}>
              <ThemedText type="small" themeColor="textSecondary">
                {isCurrent ? 'Projected' : 'Total spent'}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.statValue}>
                {formatAED(projected, { decimals: false })}
              </ThemedText>
            </Card>
            <Card style={styles.statCard}>
              <ThemedText type="small" themeColor="textSecondary">Net saved</ThemedText>
              <ThemedText
                type="smallBold"
                style={[styles.statValue, { color: savings >= 0 ? theme.income : theme.expense }]}>
                {formatAED(savings, { decimals: false })}
              </ThemedText>
            </Card>
          </Animated.View>

          {/* 6-month trend */}
          <Animated.View entering={FadeInDown.delay(160).duration(400)}>
            <Card style={styles.trendCard}>
              <View style={styles.trendHeader}>
                <ThemedText type="smallBold">6-month trend</ThemedText>
                <View style={styles.trendLegend}>
                  <View style={[styles.legendDot, { backgroundColor: theme.income }]} />
                  <ThemedText type="small" themeColor="textSecondary">In</ThemedText>
                  <View style={[styles.legendDot, { backgroundColor: theme.expense }]} />
                  <ThemedText type="small" themeColor="textSecondary">Out</ThemedText>
                </View>
              </View>
              <BarChart
                groups={trend.map((m) => ({
                  label: m.label,
                  values: [
                    { value: m.income, color: theme.income },
                    { value: m.expense, color: theme.expense },
                  ],
                }))}
                highlightIndex={highlightIndex >= 0 ? highlightIndex : undefined}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.trendCaption}>
                Peak spend {formatCompactAED(Math.max(...trend.map((m) => m.expense)))} AED · tap
                arrows above to explore months
              </ThemedText>
            </Card>
          </Animated.View>

          {/* Full insight list */}
          <Animated.View entering={FadeInDown.delay(240).duration(400)} style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Icon name="spark" size={18} color={theme.gold} />
              <ThemedText type="smallBold">What the numbers say</ThemedText>
            </View>
            <View style={styles.insightList}>
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
              {insights.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  Add a few transactions and Wafra will start analysing your habits.
                </ThemedText>
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
    gap: Spacing.three,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitleWrap: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCard: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  donutAmount: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  legend: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
  },
  legendAmount: {
    minWidth: 90,
    textAlign: 'right',
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two + 2,
  },
  statValue: {
    fontSize: 15,
  },
  trendCard: {
    gap: Spacing.three,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  trendCaption: {
    fontSize: 12,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  insightList: {
    gap: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
});
