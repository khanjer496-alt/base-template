import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MerchantAvatar } from '@/components/ui/merchant-avatar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { billsForMonth, detectRecurring, type BillStatus } from '@/lib/bills';
import { EXPENSE_CATEGORIES, getCategory } from '@/lib/categories';
import { formatAED, monthKey, parseAmountToFils, toISODate } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { CategoryId } from '@/lib/types';

export default function BillsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, addBill, deleteBill, markBillPaid } = useStore();

  const now = useMemo(() => new Date(), []);
  const key = monthKey(now);
  const todayISO = toISODate(now);

  const [adderVisible, setAdderVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dueDayText, setDueDayText] = useState('');
  const [category, setCategory] = useState<CategoryId>('utilities');

  const rows = useMemo(() => billsForMonth(state.bills, now), [state.bills, now]);

  const recurring = useMemo(() => {
    const existing = new Set(state.bills.map((b) => b.title.toLowerCase()));
    return detectRecurring(state.transactions)
      .filter((r) => !existing.has(r.title.toLowerCase()))
      .slice(0, 5);
  }, [state.transactions, state.bills]);

  const monthlyTotal = state.bills.reduce((s, b) => s + b.amountFils, 0);

  const statusMeta = (status: BillStatus, daysLeft: number) => {
    switch (status) {
      case 'paid':
        return { label: 'Paid', color: theme.income };
      case 'overdue':
        return { label: `${-daysLeft}d overdue`, color: theme.expense };
      case 'due-soon':
        return { label: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`, color: theme.warning };
      default:
        return { label: `Due in ${daysLeft}d`, color: theme.textSecondary };
    }
  };

  const saveBill = () => {
    const fils = parseAmountToFils(amountText);
    const dueDay = Number(dueDayText);
    if (!title.trim() || !fils || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return;
    addBill({ title: title.trim(), category, amountFils: fils, dueDay });
    setTitle('');
    setAmountText('');
    setDueDayText('');
    setAdderVisible(false);
  };

  const onPay = (billId: string) => {
    const bill = state.bills.find((b) => b.id === billId);
    if (!bill) return;
    const accountId = bill.accountId ?? state.accounts[0]?.id;
    if (!accountId) return;
    Alert.alert(
      `Mark "${bill.title}" as paid?`,
      `This records an expense of ${formatAED(bill.amountFils, { decimals: false })} today.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark paid',
          onPress: () =>
            markBillPaid(billId, key, {
              type: 'expense',
              amountFils: bill.amountFils,
              category: bill.category,
              accountId,
              title: bill.title,
              date: todayISO,
            }),
        },
      ],
    );
  };

  const onLongPressBill = (billId: string, billTitle: string) => {
    Alert.alert('Delete reminder?', `"${billTitle}" will no longer be tracked.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBill(billId) },
    ]);
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
            Bills & subscriptions
          </ThemedText>
          <Pressable
            onPress={() => setAdderVisible(true)}
            style={[styles.backBtn, { backgroundColor: theme.primary }]}>
            <Icon name="plus" size={18} color={theme.onPrimary} strokeWidth={2.4} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {state.bills.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {state.bills.length} tracked · about {formatAED(monthlyTotal, { decimals: false })} per
              month · long-press to delete
            </ThemedText>
          )}

          <View style={styles.list}>
            {rows.map(({ bill, status, daysLeft }, i) => {
              const meta = statusMeta(status, daysLeft);
              return (
                <Animated.View key={bill.id} entering={FadeInDown.delay(i * 50).duration(350)}>
                  <Pressable onLongPress={() => onLongPressBill(bill.id, bill.title)}>
                    <Card style={styles.billCard}>
                      <MerchantAvatar title={bill.title} category={bill.category} size={42} />
                      <View style={styles.billInfo}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {bill.title}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: meta.color }}>
                          {meta.label} · day {bill.dueDay}
                        </ThemedText>
                      </View>
                      <View style={styles.billRight}>
                        <ThemedText type="smallBold">
                          {formatAED(bill.amountFils, { decimals: false })}
                        </ThemedText>
                        {status !== 'paid' ? (
                          <Pressable
                            onPress={() => onPay(bill.id)}
                            style={[styles.payBtn, { backgroundColor: `${theme.primary}22` }]}>
                            <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                              Mark paid
                            </ThemedText>
                          </Pressable>
                        ) : (
                          <Icon name="check" size={18} color={theme.income} strokeWidth={2.6} />
                        )}
                      </View>
                    </Card>
                  </Pressable>
                </Animated.View>
              );
            })}

            {rows.length === 0 && (
              <Card style={styles.emptyCard}>
                <ThemedText style={styles.emptyEmoji}>📅</ThemedText>
                <ThemedText type="smallBold">No bill reminders yet</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  Add DEWA, telecom, rent, or any monthly payment and Wafra will remind you before
                  the due date.
                </ThemedText>
              </Card>
            )}
          </View>

          {recurring.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Icon name="spark" size={18} color={theme.gold} />
                <ThemedText type="smallBold">Detected recurring payments</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                These merchants charge you about the same amount every month.
              </ThemedText>
              {recurring.map((r) => {
                const cat = getCategory(r.category);
                return (
                  <Card key={r.title} style={styles.billCard}>
                    <MerchantAvatar title={r.title} category={r.category} size={42} />
                    <View style={styles.billInfo}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {r.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {cat.label} · ~{formatAED(r.avgAmountFils, { decimals: false })} · day{' '}
                        {r.typicalDay} · seen {r.monthsSeen} months
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() =>
                        addBill({
                          title: r.title,
                          category: r.category,
                          amountFils: r.avgAmountFils,
                          dueDay: r.typicalDay,
                          autoDetected: true,
                        })
                      }
                      style={[styles.payBtn, { backgroundColor: `${theme.gold}22` }]}>
                      <ThemedText type="small" style={{ color: theme.gold, fontWeight: '700' }}>
                        Track
                      </ThemedText>
                    </Pressable>
                  </Card>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Add bill sheet */}
      <Modal visible={adderVisible} transparent animationType="fade" onRequestClose={() => setAdderVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdderVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>New bill reminder</ThemedText>
              <Pressable onPress={() => setAdderVisible(false)}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Bill name (e.g. DEWA, Netflix, Rent)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            />

            <View style={styles.inputRow}>
              <View style={[styles.amountBox, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">AED</ThemedText>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="numeric"
                  placeholder="Amount"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.amountInput, { color: theme.text }]}
                />
              </View>
              <View style={[styles.amountBox, styles.dayBox, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">Day</ThemedText>
                <TextInput
                  value={dueDayText}
                  onChangeText={setDueDayText}
                  keyboardType="numeric"
                  placeholder="1–31"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.amountInput, { color: theme.text }]}
                />
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catPicker}>
              {EXPENSE_CATEGORIES.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: category === c.id ? `${c.color}2c` : theme.backgroundSelected,
                      borderColor: category === c.id ? c.color : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small">
                    {c.emoji} {c.label}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={saveBill}
              disabled={!title.trim() || !parseAmountToFils(amountText) || !dueDayText}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: theme.primary,
                  opacity: !title.trim() || !parseAmountToFils(amountText) || !dueDayText ? 0.45 : 1,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Save reminder</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  billInfo: {
    flex: 1,
    gap: 1,
  },
  billRight: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  payBtn: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    borderRadius: Radius.full,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyEmoji: {
    fontSize: 40,
    lineHeight: 48,
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 280,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 17,
  },
  input: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  amountBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
  dayBox: {
    flex: 0.6,
  },
  amountInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: Spacing.three,
  },
  catPicker: {
    gap: Spacing.two,
  },
  catChip: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  saveBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
