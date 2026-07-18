import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionEditSheet } from '@/components/transaction-edit-sheet';
import { TransactionRow } from '@/components/transaction-row';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EXPENSE_CATEGORIES, getCategory } from '@/lib/categories';
import { formatAED, friendlyDate, monthKey, shiftMonthKey, toISODate } from '@/lib/format';
import { inPeriod, periodLabel } from '@/lib/period';
import { usePeriod } from '@/lib/period-context';
import { useStore } from '@/lib/store';
import type { CategoryId, Transaction, TransactionType } from '@/lib/types';

type DatePreset = 'selected' | 'all' | 'month' | 'lastMonth' | '3months';
type SortMode = 'newest' | 'oldest' | 'largest';

interface Filters {
  type: TransactionType | null;
  accountId: string | null;
  categories: Set<CategoryId>;
  datePreset: DatePreset;
  minFils: number | null;
  sort: SortMode;
}

const DEFAULT_FILTERS: Filters = {
  type: null,
  accountId: null,
  categories: new Set(),
  datePreset: 'selected', // follow the app-wide reporting period by default
  minFils: null,
  sort: 'newest',
};

interface DaySection {
  title: string;
  totalFils: number;
  data: Transaction[];
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state } = useStore();
  const { period } = usePeriod();
  const { source, type: typeParam } = useLocalSearchParams<{ source?: string; type?: string }>();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(() => ({
    ...DEFAULT_FILTERS,
    categories: new Set(),
    // reviewing an SMS import must show the new rows even if the app is
    // scoped to a past period, so it starts unscoped
    datePreset: source === 'sms' ? 'all' : 'selected',
    // Home's In/Out figures deep-link here pre-filtered by type
    type: typeParam === 'income' || typeParam === 'expense' ? typeParam : null,
  }));
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const todayISO = toISODate(new Date());
  const currentKey = monthKey(new Date());

  const activeFilterCount =
    (filters.type ? 1 : 0) +
    (filters.accountId ? 1 : 0) +
    (filters.categories.size > 0 ? 1 : 0) +
    (filters.datePreset !== 'selected' ? 1 : 0) +
    (filters.minFils ? 1 : 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const lastKey = shiftMonthKey(currentKey, -1);
    const threeKey = shiftMonthKey(currentKey, -2);
    let list = state.transactions.filter((t) => {
      if (source === 'sms' && t.source !== 'sms') return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.accountId && t.accountId !== filters.accountId) return false;
      if (filters.categories.size > 0 && !filters.categories.has(t.category)) return false;
      if (filters.minFils && t.amountFils < filters.minFils) return false;
      const k = monthKey(t.date);
      if (filters.datePreset === 'selected' && !inPeriod(t.date, period)) return false;
      if (filters.datePreset === 'month' && k !== currentKey) return false;
      if (filters.datePreset === 'lastMonth' && k !== lastKey) return false;
      if (filters.datePreset === '3months' && k < threeKey) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        getCategory(t.category).label.toLowerCase().includes(q)
      );
    });
    if (filters.sort === 'largest') {
      list = [...list].sort((a, b) => b.amountFils - a.amountFils);
    } else if (filters.sort === 'oldest') {
      list = [...list].reverse();
    }
    return list;
  }, [state.transactions, query, filters, source, currentKey, period]);

  const totalShown = useMemo(
    () =>
      filtered.reduce(
        (s, t) => (t.isTransfer ? s : s + (t.type === 'expense' ? -t.amountFils : t.amountFils)),
        0,
      ),
    [filtered],
  );

  const sections = useMemo<DaySection[]>(() => {
    if (filters.sort === 'largest') {
      return [{ title: 'Largest first', totalFils: totalShown, data: filtered }];
    }
    const byDay = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    }
    return [...byDay.entries()].map(([date, data]) => ({
      title: friendlyDate(date, todayISO),
      totalFils: data.reduce(
        (s, t) => (t.isTransfer ? s : s + (t.type === 'expense' ? -t.amountFils : t.amountFils)),
        0,
      ),
      data,
    }));
  }, [filtered, filters.sort, todayISO, totalShown]);

  const toggleCategory = (id: CategoryId) => {
    const next = new Set(filters.categories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilters({ ...filters, categories: next });
  };

  const clearFilters = () => setFilters({ ...DEFAULT_FILTERS, categories: new Set() });

  const presetLabel: Record<DatePreset, string> = {
    selected: period.mode === 'all' ? 'Selected period' : periodLabel(period),
    all: 'All time',
    month: 'This month',
    lastMonth: 'Last month',
    '3months': 'Last 3 months',
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: theme.backgroundSelected }]}>
            <Icon name="chevron-left" size={18} color={theme.text} />
          </Pressable>
          <ThemedText type="heading">Transactions</ThemedText>
          <Pressable
            onPress={() => setSheetVisible(true)}
            style={[
              styles.backBtn,
              { backgroundColor: activeFilterCount > 0 ? theme.primary : theme.backgroundSelected },
            ]}>
            <Icon
              name="chart"
              size={17}
              color={activeFilterCount > 0 ? theme.onPrimary : theme.text}
            />
          </Pressable>
        </View>

        <View style={styles.controls}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder },
            ]}>
            <Icon name="search" size={17} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search merchants or categories"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Icon name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          <View style={styles.summaryRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
              {filters.datePreset === 'selected' && period.mode !== 'all'
                ? ` · ${periodLabel(period)}`
                : ''}
              {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ''}
            </ThemedText>
            <View style={styles.summaryRight}>
              <ThemedText
                type="smallBold"
                tabular
                style={{ color: totalShown >= 0 ? theme.income : theme.text }}>
                {totalShown >= 0 ? '+' : '−'}
                {formatAED(Math.abs(totalShown), { decimals: false })}
              </ThemedText>
              {activeFilterCount > 0 && (
                <Pressable onPress={clearFilters}>
                  <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                    Clear
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={14}
          windowSize={9}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <ThemedText type="micro" themeColor="textSecondary">
                {section.title}
              </ThemedText>
              <ThemedText
                type="small"
                tabular
                style={{ color: section.totalFils >= 0 ? theme.income : theme.textSecondary }}>
                {section.totalFils >= 0 ? '+' : '−'}
                {formatAED(Math.abs(section.totalFils), { decimals: false })}
              </ThemedText>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <View
              style={
                index < section.data.length && index > 0
                  ? [styles.rowDivider, { borderTopColor: theme.cardBorder }]
                  : undefined
              }>
              <TransactionRow
                transaction={item}
                account={state.accounts.find((a) => a.id === item.accountId)}
                onPress={() => setEditing(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
                <Icon name="search" size={24} color={theme.textSecondary} strokeWidth={1.7} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Nothing matches. Adjust search or filters.
              </ThemedText>
            </View>
          }
        />
      </SafeAreaView>

      {/* Filter sheet */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="heading">Filters</ThemedText>
              <Pressable onPress={() => setSheetVisible(false)}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ThemedText type="micro" themeColor="textSecondary">Type</ThemedText>
            <View style={styles.chipRow}>
              {([null, 'expense', 'income'] as (TransactionType | null)[]).map((t) => (
                <Pressable
                  key={String(t)}
                  onPress={() => setFilters({ ...filters, type: t })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        filters.type === t ? `${theme.primary}22` : theme.backgroundSelected,
                      borderColor: filters.type === t ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small">
                    {t === null ? 'All' : t === 'expense' ? '− Expenses' : '+ Income'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText type="micro" themeColor="textSecondary">Period</ThemedText>
            <View style={styles.chipRow}>
              {(Object.keys(presetLabel) as DatePreset[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setFilters({ ...filters, datePreset: p })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        filters.datePreset === p ? `${theme.primary}22` : theme.backgroundSelected,
                      borderColor: filters.datePreset === p ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small">{presetLabel[p]}</ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText type="micro" themeColor="textSecondary">Account</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowScroll}>
              <Pressable
                onPress={() => setFilters({ ...filters, accountId: null })}
                style={[
                  styles.chip,
                  {
                    backgroundColor: !filters.accountId ? `${theme.primary}22` : theme.backgroundSelected,
                    borderColor: !filters.accountId ? theme.primary : 'transparent',
                  },
                ]}>
                <ThemedText type="small">All</ThemedText>
              </Pressable>
              {state.accounts.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() =>
                    setFilters({ ...filters, accountId: filters.accountId === a.id ? null : a.id })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        filters.accountId === a.id ? `${a.color}26` : theme.backgroundSelected,
                      borderColor: filters.accountId === a.id ? a.color : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small">{a.name}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            <ThemedText type="micro" themeColor="textSecondary">Categories</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowScroll}>
              {EXPENSE_CATEGORIES.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => toggleCategory(c.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: filters.categories.has(c.id)
                        ? `${c.color}2c`
                        : theme.backgroundSelected,
                      borderColor: filters.categories.has(c.id) ? c.color : 'transparent',
                    },
                  ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={c.icon} size={13} color={c.color} />
                    <ThemedText type="small">{c.label}</ThemedText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.sheetSplit}>
              <View style={styles.sheetCol}>
                <ThemedText type="micro" themeColor="textSecondary">Min amount</ThemedText>
                <View style={styles.chipRow}>
                  {[null, 10000, 50000, 100000].map((v) => (
                    <Pressable
                      key={String(v)}
                      onPress={() => setFilters({ ...filters, minFils: v })}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            filters.minFils === v ? `${theme.primary}22` : theme.backgroundSelected,
                          borderColor: filters.minFils === v ? theme.primary : 'transparent',
                        },
                      ]}>
                      <ThemedText type="small">{v === null ? 'Any' : `${v / 100}+`}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <ThemedText type="micro" themeColor="textSecondary">Sort</ThemedText>
            <View style={styles.chipRow}>
              {(['newest', 'oldest', 'largest'] as SortMode[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setFilters({ ...filters, sort: s })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        filters.sort === s ? `${theme.primary}22` : theme.backgroundSelected,
                      borderColor: filters.sort === s ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small">
                    {s === 'newest' ? 'Newest' : s === 'oldest' ? 'Oldest' : 'Largest'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.sheetActions}>
              <Pressable
                onPress={clearFilters}
                style={[styles.resetBtn, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold">Reset</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setSheetVisible(false)}
                style={[styles.applyBtn, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                  Show {filtered.length} result{filtered.length === 1 ? '' : 's'}
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TransactionEditSheet transaction={editing} onClose={() => setEditing(null)} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.two + 4,
    fontSize: 14,
    fontWeight: '500',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 15, 12, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: -Spacing.two,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  chipRowScroll: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  sheetSplit: {
    flexDirection: 'row',
  },
  sheetCol: {
    flex: 1,
    gap: Spacing.two,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  resetBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  applyBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
