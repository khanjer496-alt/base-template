import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
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
import { TransactionRow } from '@/components/transaction-row';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EXPENSE_CATEGORIES, getCategory } from '@/lib/categories';
import { formatAED, friendlyDate, toISODate } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { CategoryId, Transaction } from '@/lib/types';

interface DaySection {
  title: string;
  totalFils: number;
  data: Transaction[];
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, deleteTransaction } = useStore();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CategoryId | null>(null);

  const todayISO = toISODate(new Date());

  const sections = useMemo<DaySection[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = state.transactions.filter((t) => {
      if (filter && t.category !== filter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        getCategory(t.category).label.toLowerCase().includes(q)
      );
    });

    const byDay = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = byDay.get(t.date) ?? [];
      list.push(t);
      byDay.set(t.date, list);
    }

    return [...byDay.entries()].map(([date, data]) => ({
      title: friendlyDate(date, todayISO),
      totalFils: data.reduce(
        (s, t) => s + (t.type === 'expense' ? -t.amountFils : t.amountFils),
        0,
      ),
      data,
    }));
  }, [state.transactions, query, filter, todayISO]);

  const onRowPress = (t: Transaction) => {
    const meta = getCategory(t.category);
    const account = state.accounts.find((a) => a.id === t.accountId);
    Alert.alert(
      t.title,
      `${t.type === 'income' ? 'Income' : 'Expense'} · ${meta.label}\n${formatAED(t.amountFils)}\n${t.date}${account ? `\n${account.name}` : ''}`,
      [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTransaction(t.id),
        },
      ],
    );
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
          <ThemedText type="smallBold" style={styles.headerTitle}>
            All transactions
          </ThemedText>
          <View style={styles.backBtn} />
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}>
            <Pressable
              onPress={() => setFilter(null)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === null ? `${theme.primary}22` : theme.backgroundElement,
                  borderColor: filter === null ? theme.primary : theme.cardBorder,
                },
              ]}>
              <ThemedText type="small">All</ThemedText>
            </Pressable>
            {EXPENSE_CATEGORIES.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setFilter(filter === c.id ? null : c.id)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === c.id ? `${c.color}2c` : theme.backgroundElement,
                    borderColor: filter === c.id ? c.color : theme.cardBorder,
                  },
                ]}>
                <ThemedText type="small">
                  {c.emoji} {c.label}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {section.title}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: section.totalFils >= 0 ? theme.income : theme.textSecondary }}>
                {section.totalFils >= 0 ? '+' : '−'}
                {formatAED(Math.abs(section.totalFils), { decimals: false })}
              </ThemedText>
            </View>
          )}
          renderItem={({ item }) => (
            <View
              style={[
                styles.rowCard,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}>
              <TransactionRow
                transaction={item}
                account={state.accounts.find((a) => a.id === item.accountId)}
                onPress={() => onRowPress(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText style={styles.emptyEmoji}>🔍</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Nothing matches — try a different search or filter.
              </ThemedText>
            </View>
          }
        />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitle: {
    fontSize: 16,
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
  filterRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  filterChip: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  listContent: {
    padding: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  rowCard: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  emptyEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
});
