import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InsightCard } from '@/components/insight-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BarChart } from '@/components/ui/bar-chart';
import { DonutChart } from '@/components/ui/donut-chart';
import { Icon } from '@/components/ui/icon';
import { MerchantAvatar } from '@/components/ui/merchant-avatar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  categoryMovers,
  categoryTrend,
  dayOfWeekSpend,
  netWorthSeries,
  topMerchants,
} from '@/lib/analytics';
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
import type { CategoryId } from '@/lib/types';

const TAB_BAR_CLEARANCE = 110;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function StatsScreen() {
  const theme = useTheme();
  const { state } = useStore();
  const now = useMemo(() => new Date(), []);
  const currentKey = monthKey(now);
  const [key, setKey] = useState(currentKey);
  const [drillCategory, setDrillCategory] = useState<CategoryId | null>(null);

  const summary = useMemo(() => summarizeMonth(state.transactions, key), [state.transactions, key]);
  const insights = useMemo(
    () => buildInsights(state.transactions, state.budgets, key, now),
    [state.transactions, state.budgets, key, now],
  );
  const merchants = useMemo(() => topMerchants(state.transactions, key), [state.transactions, key]);
  const movers = useMemo(() => categoryMovers(state.transactions, key), [state.transactions, key]);
  const weekSpend = useMemo(() => dayOfWeekSpend(state.transactions, key), [state.transactions, key]);
  const netWorth = useMemo(() => netWorthSeries(state), [state]);
  const drillTrend = useMemo(
    () => (drillCategory ? categoryTrend(state.transactions, drillCategory) : []),
    [state.transactions, drillCategory],
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
  const weekMax = Math.max(1, ...weekSpend);

  const segments = summary.byCategory.map((c) => ({
    value: c.totalFils,
    color: getCategory(c.category).color,
  }));

  // Net worth sparkline geometry
  const nwWidth = 320;
  const nwHeight = 56;
  const nwMin = Math.min(...netWorth.map((p) => p.fils));
  const nwMax = Math.max(...netWorth.map((p) => p.fils));
  const nwRange = Math.max(1, nwMax - nwMin);
  const nwPoints = netWorth
    .map((p, i) => {
      const x = (i / Math.max(1, netWorth.length - 1)) * nwWidth;
      const y = nwHeight - 6 - ((p.fils - nwMin) / nwRange) * (nwHeight - 12);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Month navigator */}
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => {
                setKey(shiftMonthKey(key, -1));
                setDrillCategory(null);
              }}
              style={[styles.navBtn, { backgroundColor: theme.backgroundSelected }]}>
              <Icon name="chevron-left" size={18} color={theme.text} />
            </Pressable>
            <View style={styles.monthTitleWrap}>
              <ThemedText type="heading">{monthLabel(key)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Monthly report
              </ThemedText>
            </View>
            <Pressable
              disabled={isCurrent}
              onPress={() => {
                setKey(shiftMonthKey(key, 1));
                setDrillCategory(null);
              }}
              style={[
                styles.navBtn,
                { backgroundColor: theme.backgroundSelected, opacity: isCurrent ? 0.35 : 1 },
              ]}>
              <Icon name="chevron-right" size={18} color={theme.text} />
            </Pressable>
          </View>

          {/* Donut + tappable legend */}
          <Animated.View entering={FadeInDown.duration(350)} style={styles.donutBlock}>
            <DonutChart segments={segments} trackColor={theme.track}>
              <ThemedText type="micro" themeColor="textSecondary">
                Spent
              </ThemedText>
              <ThemedText type="subtitle" tabular>
                {formatAED(summary.expenseFils, { decimals: false })}
              </ThemedText>
            </DonutChart>

            <View style={styles.legend}>
              {summary.byCategory.slice(0, 6).map((c) => {
                const meta = getCategory(c.category);
                const active = drillCategory === c.category;
                return (
                  <Pressable
                    key={c.category}
                    onPress={() => setDrillCategory(active ? null : c.category)}
                    style={[
                      styles.legendRow,
                      active && { backgroundColor: theme.backgroundSelected, borderRadius: Radius.sm },
                    ]}>
                    <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                    <ThemedText type="small" style={styles.legendLabel} numberOfLines={1}>
                      {meta.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" tabular>
                      {Math.round(c.share * 100)}%
                    </ThemedText>
                    <ThemedText type="smallBold" tabular style={styles.legendAmount}>
                      {formatAED(c.totalFils, { decimals: false })}
                    </ThemedText>
                    <Icon
                      name="chevron-right"
                      size={13}
                      color={active ? theme.primary : theme.textSecondary}
                    />
                  </Pressable>
                );
              })}
              {summary.byCategory.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  No expenses recorded for this month.
                </ThemedText>
              )}
            </View>
          </Animated.View>

          {/* Category drill-down */}
          {drillCategory && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.drill}>
              <View style={styles.sectionTitleRow}>
                <ThemedText type="smallBold">
                  {getCategory(drillCategory).emoji} {getCategory(drillCategory).label} · 6 months
                </ThemedText>
                <Pressable onPress={() => setDrillCategory(null)}>
                  <Icon name="close" size={16} color={theme.textSecondary} />
                </Pressable>
              </View>
              <BarChart
                height={80}
                groups={drillTrend.map((m) => ({
                  label: monthLabel(m.key, true).split(' ')[0],
                  values: [{ value: m.fils, color: getCategory(drillCategory).color }],
                }))}
              />
              {topMerchants(
                state.transactions.filter((t) => t.category === drillCategory),
                key,
                3,
              ).map((m) => (
                <View key={m.title} style={styles.merchantRow}>
                  <MerchantAvatar title={m.title} category={drillCategory} size={34} />
                  <ThemedText type="small" style={styles.merchantName} numberOfLines={1}>
                    {m.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {m.count}x
                  </ThemedText>
                  <ThemedText type="smallBold" tabular style={styles.merchantAmount}>
                    {formatAED(m.totalFils, { decimals: false })}
                  </ThemedText>
                </View>
              ))}
            </Animated.View>
          )}

          {/* Inline stat band */}
          <Animated.View
            entering={FadeInDown.delay(60).duration(350)}
            style={[styles.statBand, { borderColor: theme.cardBorder }]}>
            <View style={styles.statItem}>
              <ThemedText type="micro" themeColor="textSecondary">Daily avg</ThemedText>
              <ThemedText type="smallBold" tabular>{formatAED(dailyAvg, { decimals: false })}</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.statItem}>
              <ThemedText type="micro" themeColor="textSecondary">
                {isCurrent ? 'Projected' : 'Spent'}
              </ThemedText>
              <ThemedText type="smallBold" tabular>{formatAED(projected, { decimals: false })}</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.statItem}>
              <ThemedText type="micro" themeColor="textSecondary">Net saved</ThemedText>
              <ThemedText
                type="smallBold"
                tabular
                style={{ color: savings >= 0 ? theme.income : theme.expense }}>
                {formatAED(savings, { decimals: false })}
              </ThemedText>
            </View>
          </Animated.View>

          {/* Biggest movers */}
          {movers.length > 0 && (
            <Animated.View entering={FadeInDown.delay(100).duration(350)} style={styles.section}>
              <ThemedText type="smallBold">Biggest changes vs {monthLabel(shiftMonthKey(key, -1), true)}</ThemedText>
              {movers.map((m) => {
                const meta = getCategory(m.category);
                const up = m.deltaFils > 0;
                return (
                  <View key={m.category} style={styles.moverRow}>
                    <ThemedText type="small" style={styles.moverLabel}>
                      {meta.emoji} {meta.label}
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      tabular
                      style={{ color: up ? theme.expense : theme.income }}>
                      {up ? '▲' : '▼'} {formatAED(Math.abs(m.deltaFils), { decimals: false })}
                    </ThemedText>
                  </View>
                );
              })}
            </Animated.View>
          )}

          {/* Top merchants */}
          {merchants.length > 0 && (
            <Animated.View entering={FadeInDown.delay(140).duration(350)} style={styles.section}>
              <ThemedText type="smallBold">Where the money went</ThemedText>
              {merchants.map((m) => (
                <View key={m.title} style={styles.merchantRow}>
                  <MerchantAvatar title={m.title} category={m.category} size={34} />
                  <ThemedText type="small" style={styles.merchantName} numberOfLines={1}>
                    {m.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {m.count}x
                  </ThemedText>
                  <ThemedText type="smallBold" tabular style={styles.merchantAmount}>
                    {formatAED(m.totalFils, { decimals: false })}
                  </ThemedText>
                </View>
              ))}
            </Animated.View>
          )}

          {/* Day-of-week pattern */}
          <Animated.View entering={FadeInDown.delay(180).duration(350)} style={styles.section}>
            <ThemedText type="smallBold">Spending by weekday</ThemedText>
            <View style={styles.weekRow}>
              {weekSpend.map((v, i) => (
                <View key={i} style={styles.weekCol}>
                  <View style={[styles.weekTrack, { backgroundColor: theme.track }]}>
                    <View
                      style={[
                        styles.weekFill,
                        {
                          height: `${Math.max(4, (v / weekMax) * 100)}%`,
                          backgroundColor: i === 5 || i === 6 ? theme.gold : theme.primary,
                        },
                      ]}
                    />
                  </View>
                  <ThemedText type="micro" themeColor="textSecondary">
                    {DAY_LABELS[i]}
                  </ThemedText>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Net worth trend */}
          <Animated.View entering={FadeInDown.delay(220).duration(350)} style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <ThemedText type="smallBold">Net worth · 6 months</ThemedText>
              <ThemedText type="smallBold" tabular style={{ color: theme.primary }}>
                {formatAED(netWorth[netWorth.length - 1]?.fils ?? 0, { decimals: false })}
              </ThemedText>
            </View>
            <View style={styles.sparkWrap}>
              <Svg width="100%" height={nwHeight} viewBox={`0 0 ${nwWidth} ${nwHeight}`}>
                <Polyline
                  points={nwPoints}
                  fill="none"
                  stroke={theme.primary}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <View style={styles.sparkLabels}>
                <ThemedText type="micro" themeColor="textSecondary">
                  {monthLabel(netWorth[0]?.key ?? key, true)}
                </ThemedText>
                <ThemedText type="micro" themeColor="textSecondary">
                  {monthLabel(netWorth[netWorth.length - 1]?.key ?? key, true)}
                </ThemedText>
              </View>
            </View>
          </Animated.View>

          {/* Income vs expense trend */}
          <Animated.View entering={FadeInDown.delay(260).duration(350)} style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <ThemedText type="smallBold">Cashflow · 6 months</ThemedText>
              <View style={styles.trendLegend}>
                <View style={[styles.legendDot, { backgroundColor: theme.income }]} />
                <ThemedText type="micro" themeColor="textSecondary">In</ThemedText>
                <View style={[styles.legendDot, { backgroundColor: theme.expense }]} />
                <ThemedText type="micro" themeColor="textSecondary">Out</ThemedText>
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
            <ThemedText type="micro" themeColor="textSecondary">
              Peak spend {formatCompactAED(Math.max(...trend.map((m) => m.expense)))} AED
            </ThemedText>
          </Animated.View>

          {/* Insight feed */}
          <Animated.View entering={FadeInDown.delay(300).duration(350)} style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.titleWithIcon}>
                <Icon name="spark" size={17} color={theme.gold} />
                <ThemedText type="smallBold">What the numbers say</ThemedText>
              </View>
            </View>
            <View style={styles.insightList}>
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
              {insights.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  Add transactions and analysis will appear here.
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
    gap: Spacing.four,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitleWrap: {
    alignItems: 'center',
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutBlock: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  legend: {
    alignSelf: 'stretch',
    gap: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.one,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
  },
  legendAmount: {
    minWidth: 86,
    textAlign: 'right',
  },
  drill: {
    gap: Spacing.two,
    paddingLeft: Spacing.two,
  },
  statBand: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two + 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  moverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one + 1,
  },
  moverLabel: {
    flex: 1,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 1,
  },
  merchantName: {
    flex: 1,
  },
  merchantAmount: {
    minWidth: 80,
    textAlign: 'right',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  weekCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  weekTrack: {
    width: 14,
    height: 64,
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weekFill: {
    width: '100%',
    borderRadius: 7,
  },
  sparkWrap: {
    gap: Spacing.one,
  },
  sparkLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  insightList: {
    gap: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
});
