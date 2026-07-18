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
import { Icon } from '@/components/ui/icon';
import { MerchantAvatar } from '@/components/ui/merchant-avatar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { billsForMonth, type BillStatus } from '@/lib/bills';
import { EXPENSE_CATEGORIES } from '@/lib/categories';
import { formatAED, monthKey, parseAmountToFils, toISODate } from '@/lib/format';
import {
  detectSubscriptions,
  daysUntilNext,
  fixedCommitments,
  subscriptionsMonthlyTotal,
  trueSubscriptions,
  type Subscription,
} from '@/lib/subscriptions';
import { useStore } from '@/lib/store';
import type { CategoryId } from '@/lib/types';

type Segment = 'reminders' | 'subscriptions';

export default function BillsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, addBill, deleteBill, markBillPaid, setNotSubscription } = useStore();

  const now = useMemo(() => new Date(), []);
  const key = monthKey(now);
  const todayISO = toISODate(now);

  const [segment, setSegment] = useState<Segment>('subscriptions');
  const [adderVisible, setAdderVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dueDayText, setDueDayText] = useState('');
  const [category, setCategory] = useState<CategoryId>('utilities');

  const rows = useMemo(
    () => billsForMonth(state.bills, state.transactions, now),
    [state.bills, state.transactions, now],
  );
  const detected = useMemo(
    () => detectSubscriptions(state.transactions, state.notSubscriptions),
    [state.transactions, state.notSubscriptions],
  );
  const subs = useMemo(() => trueSubscriptions(detected), [detected]);
  const commitments = useMemo(() => fixedCommitments(detected), [detected]);
  const subsTotal = subscriptionsMonthlyTotal(subs);
  const trackedTitles = useMemo(
    () => new Set(state.bills.map((b) => b.title.toLowerCase())),
    [state.bills],
  );

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
      `Records an expense of ${formatAED(bill.amountFils, { decimals: false })} today.`,
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
              source: 'manual',
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

  const onDismissSub = (sub: Subscription) => {
    Alert.alert(
      'Not a subscription?',
      `"${sub.title}" will stop appearing in subscriptions and won't count toward the monthly total.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => setNotSubscription(sub.title, true) },
      ],
    );
  };

  const renderRecurringRow = (sub: Subscription, i: number) => {
    const next = daysUntilNext(sub, now);
    const tracked = trackedTitles.has(sub.title.toLowerCase());
    return (
      <Animated.View key={sub.title} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(300)}>
        <Pressable
          onLongPress={() => onDismissSub(sub)}
          style={[
            styles.row,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder },
          ]}>
          <MerchantAvatar title={sub.title} category={sub.category} size={42} />
          <View style={styles.rowInfo}>
            <View style={styles.rowTitleLine}>
              <ThemedText type="default" numberOfLines={1} style={styles.rowTitle}>
                {sub.title}
              </ThemedText>
              {sub.priceIncreased && (
                <View style={[styles.badge, { backgroundColor: `${theme.warning}22` }]}>
                  <ThemedText type="micro" style={{ color: theme.warning }}>
                    price up
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {sub.cadence} · {sub.chargeCount}x charged ·{' '}
              {next >= 0 ? `next in ${next}d` : `expected ${-next}d ago`}
            </ThemedText>
          </View>
          <View style={styles.rowRight}>
            <ThemedText type="smallBold" tabular>
              {formatAED(sub.avgAmountFils, { decimals: false })}
            </ThemedText>
            {!tracked && (
              <Pressable
                onPress={() =>
                  addBill({
                    title: sub.title,
                    category: sub.category,
                    amountFils: sub.avgAmountFils,
                    dueDay: Number(sub.nextExpectedISO.slice(8)),
                    autoDetected: true,
                  })
                }>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                  Remind me
                </ThemedText>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Animated.View>
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
          <ThemedText type="heading">Bills</ThemedText>
          <Pressable
            onPress={() => setAdderVisible(true)}
            style={[styles.backBtn, { backgroundColor: theme.primary }]}>
            <Icon name="plus" size={18} color={theme.onPrimary} strokeWidth={2.4} />
          </Pressable>
        </View>

        <View style={[styles.segment, { backgroundColor: theme.backgroundSelected }]}>
          {(['subscriptions', 'reminders'] as Segment[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSegment(s)}
              style={[styles.segmentItem, segment === s && { backgroundColor: theme.card }]}>
              <ThemedText
                type="smallBold"
                themeColor={segment === s ? 'text' : 'textSecondary'}>
                {s === 'subscriptions' ? `Subscriptions (${subs.length})` : `Reminders (${rows.length})`}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {segment === 'subscriptions' && (
            <>
              {subs.length > 0 && (
                <View style={styles.totalRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Detected from your charge history · long-press to remove
                  </ThemedText>
                  <ThemedText type="smallBold" tabular>
                    {formatAED(subsTotal, { decimals: false })}/mo
                  </ThemedText>
                </View>
              )}
              <View>{subs.map((sub, i) => renderRecurringRow(sub, i))}</View>

              {commitments.length > 0 && (
                <View style={styles.commitBlock}>
                  <ThemedText type="micro" themeColor="textSecondary">
                    Fixed monthly commitments
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Rent, utilities and other regular payments — recurring, but not
                    cancellable subscriptions.
                  </ThemedText>
                  <View>{commitments.map((sub, i) => renderRecurringRow(sub, i))}</View>
                </View>
              )}

              {subs.length === 0 && commitments.length === 0 && (
                <View style={styles.empty}>
                  <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Icon name="repeat" size={26} color={theme.textSecondary} strokeWidth={1.7} />
                  </View>
                  <ThemedText type="smallBold">No subscriptions detected yet</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    Import your bank SMS and repeat charges will show up here.
                  </ThemedText>
                </View>
              )}
            </>
          )}

          {segment === 'reminders' && (
            <>
              {rows.length > 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  Long-press a reminder to delete it.
                </ThemedText>
              )}
              <View>
                {rows.map(({ bill, status, daysLeft }, i) => {
                  const meta = statusMeta(status, daysLeft);
                  return (
                    <Pressable
                      key={bill.id}
                      onLongPress={() => onLongPressBill(bill.id, bill.title)}
                      style={[
                        styles.row,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder },
                      ]}>
                      <MerchantAvatar title={bill.title} category={bill.category} size={42} />
                      <View style={styles.rowInfo}>
                        <ThemedText type="default" numberOfLines={1}>
                          {bill.title}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: meta.color }}>
                          {meta.label} · day {bill.dueDay}
                        </ThemedText>
                      </View>
                      <View style={styles.rowRight}>
                        <ThemedText type="smallBold" tabular>
                          {formatAED(bill.amountFils, { decimals: false })}
                        </ThemedText>
                        {status !== 'paid' ? (
                          <Pressable onPress={() => onPay(bill.id)}>
                            <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                              Mark paid
                            </ThemedText>
                          </Pressable>
                        ) : (
                          <Icon name="check" size={16} color={theme.income} strokeWidth={2.6} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {rows.length === 0 && (
                <View style={styles.empty}>
                  <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Icon name="calendar" size={26} color={theme.textSecondary} strokeWidth={1.7} />
                  </View>
                  <ThemedText type="smallBold">No reminders yet</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    Tap + to track DEWA, rent, or any monthly payment.
                  </ThemedText>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Add reminder sheet */}
      <Modal visible={adderVisible} transparent animationType="fade" onRequestClose={() => setAdderVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdderVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="heading">New reminder</ThemedText>
              <Pressable onPress={() => setAdderVisible(false)}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Name (e.g. DEWA, Netflix, Rent)"
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
                  placeholder="1-31"
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={c.icon} size={13} color={c.color} />
                    <ThemedText type="small">{c.label}</ThemedText>
                  </View>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    marginHorizontal: Spacing.three,
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md - 3,
  },
  content: {
    padding: Spacing.three,
    paddingTop: Spacing.two,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  commitBlock: {
    marginTop: Spacing.four,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + 4,
  },
  rowInfo: {
    flex: 1,
    gap: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowTitle: {
    flexShrink: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  hint: {
    paddingBottom: Spacing.one,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 280,
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
    gap: Spacing.three,
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
