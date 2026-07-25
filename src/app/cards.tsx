import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BankAvatar } from '@/components/ui/bank-avatar';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { accountLastActivityISO, isInactiveAccount, openDues } from '@/lib/cards';
import { formatAED, monthKey, shortDate } from '@/lib/format';
import { reliableBalanceFils, useStore } from '@/lib/store';
import type { Account } from '@/lib/types';

/** Every card as a wallet-style tile: bank, last4, live figures. */
export default function CardsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, editAccount, deleteAccount } = useStore();
  const now = useMemo(() => new Date(), []);
  const [showInactive, setShowInactive] = useState(false);
  const [detail, setDetail] = useState<Account | null>(null);

  // Opened from a due row on the Bills tab: land straight on that card's
  // statements and payment history rather than on the grid.
  const { card: cardParam } = useLocalSearchParams<{ card?: string }>();
  useEffect(() => {
    if (!cardParam) return;
    const target = state.accounts.find((a) => a.id === cardParam);
    if (target) setDetail(target);
  }, [cardParam, state.accounts]);

  /**
   * Everything about the tapped card that lives outside the tile: its
   * statements newest-first, and the payments made against it. Both come from
   * data already on device — statements from cardDues, payments from the
   * transfers the importer records when a card payment is detected.
   */
  const detailData = useMemo(() => {
    if (!detail) return null;
    const statements = state.cardDues
      .filter((d) => d.accountId === detail.id)
      .slice()
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    const payments = state.transactions
      .filter((t) => t.accountId === detail.id && t.isTransfer && t.type === 'income')
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const paidTotal = payments.reduce((s, t) => s + t.amountFils, 0);
    return { statements, payments, paidTotal };
  }, [detail, state.cardDues, state.transactions]);

  const cards = useMemo(
    () => state.accounts.filter((a) => a.kind === 'card' || a.cardType),
    [state.accounts],
  );
  // Expired/unused cards (silent 90+ days, or hidden by hand) go to the bottom.
  const activeCards = useMemo(
    () => cards.filter((c) => !isInactiveAccount(state, c, now)),
    [cards, state, now],
  );
  const inactiveCards = useMemo(
    () => cards.filter((c) => isInactiveAccount(state, c, now)),
    [cards, state, now],
  );

  const cardOptions = (card: Account) => {
    Alert.alert(card.name, card.archived ? 'Hidden from lists.' : undefined, [
      {
        text: card.archived ? 'Unhide' : 'Hide card',
        onPress: () => editAccount(card.id, { archived: !card.archived }),
      },
      {
        text: 'Delete card + its transactions',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete card?', `"${card.name}" and all its transactions will be removed.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteAccount(card.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const dues = useMemo(() => openDues(state, now), [state, now]);
  const monthSpend = useMemo(() => {
    const key = monthKey(now);
    const map = new Map<string, number>();
    for (const t of state.transactions) {
      if (t.type !== 'expense' || t.isTransfer || monthKey(t.date) !== key) continue;
      map.set(t.accountId, (map.get(t.accountId) ?? 0) + t.amountFils);
    }
    return map;
  }, [state.transactions, now]);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: theme.backgroundSelected }]}>
            <Icon name="chevron-left" size={18} color={theme.text} />
          </Pressable>
          <ThemedText type="heading">Cards</ThemedText>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {(() => {
          const renderCard = (card: Account, i: number, inactive: boolean) => {
            const isCredit = card.cardType === 'credit';
            // Only a bank-quoted outstanding figure is trustworthy; partial
            // SMS history can't reconstruct one, so we fall back to spend.
            const reliable = reliableBalanceFils(state, card);
            const outstanding = isCredit && reliable !== null ? Math.abs(reliable) : null;
            const limitLeft =
              card.snapshotKind === 'limit' && card.snapshotFils !== undefined
                ? card.snapshotFils
                : null;
            const spent = monthSpend.get(card.id) ?? 0;
            const due = dues.find((d) => d.due.accountId === card.id);
            const lastUsed = inactive ? accountLastActivityISO(state, card.id) : null;
            return (
              <Animated.View
                key={card.id}
                entering={FadeInDown.delay(i * 70).duration(350)}
                style={inactive ? styles.inactiveTile : undefined}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${card.name}, open statements and payments`}
                  onPress={() => setDetail(card)}
                  onLongPress={() => cardOptions(card)}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: theme.card,
                      borderColor: `${card.color}55`,
                      transform: [{ scale: pressed ? 0.99 : 1 }],
                    },
                  ]}>
                  {/* A flat brand wash. The old build stacked a 220px circle on
                      top of it, which cropped to a hard arc across the tile. */}
                  <View style={[styles.tileWash, { backgroundColor: `${card.color}14` }]} />
                  <View style={[styles.tileEdge, { backgroundColor: card.color }]} />

                  <View style={styles.tileTop}>
                    <BankAvatar name={card.bankName ?? card.name} color={card.color} size={34} />
                    <View style={styles.tileTopText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {card.bankName ??
                          (card.name.replace(/\s*(?:credit|debit)?\s*card.*$/i, '').trim() || 'Card')}
                      </ThemedText>
                      <ThemedText type="micro" themeColor="textSecondary" tabular>
                        {isCredit ? 'CREDIT' : 'DEBIT'} ·· {card.last4 ?? '????'}
                      </ThemedText>
                    </View>
                    {due && (
                      <View
                        style={[
                          styles.dueChip,
                          {
                            backgroundColor:
                              due.status === 'overdue' || due.status === 'urgent'
                                ? `${theme.expense}1f`
                                : `${theme.warning}1f`,
                          },
                        ]}>
                        <ThemedText
                          type="micro"
                          style={{
                            color:
                              due.status === 'overdue' || due.status === 'urgent'
                                ? theme.expense
                                : theme.warning,
                            fontWeight: '700',
                          }}>
                          {due.status === 'overdue'
                            ? 'OVERDUE'
                            : `DUE ${shortDate(due.due.dueDate).toUpperCase()}`}
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View style={styles.tileMiddle}>
                    <ThemedText type="micro" themeColor="textSecondary">
                      {outstanding !== null ? 'OUTSTANDING' : 'SPENT THIS MONTH'}
                    </ThemedText>
                    <ThemedText type="title" tabular>
                      {formatAED(outstanding ?? spent, { decimals: false })}
                    </ThemedText>
                    {outstanding !== null && spent > 0 && (
                      <ThemedText type="small" themeColor="textSecondary" tabular>
                        {formatAED(spent, { decimals: false })} spent this month
                      </ThemedText>
                    )}
                  </View>

                  {/* Headroom is what people actually check before spending, so
                      it sits on the tile rather than as a caption underneath.
                      Only "limit left" is ever quoted in SMS — the total limit
                      is unknown, so this stays a figure and not a gauge. */}
                  {limitLeft !== null ? (
                    <View style={styles.tileFooterRow}>
                      <ThemedText type="micro" themeColor="textSecondary">
                        LIMIT LEFT
                      </ThemedText>
                      <ThemedText type="smallBold" tabular>
                        {formatAED(limitLeft, { decimals: false })}
                      </ThemedText>
                    </View>
                  ) : (
                    lastUsed && (
                      <View style={styles.tileFooterRow}>
                        <ThemedText type="micro" themeColor="textSecondary">
                          {t('lastUsed').toUpperCase()}
                        </ThemedText>
                        <ThemedText type="smallBold" tabular>
                          {shortDate(lastUsed)}
                        </ThemedText>
                      </View>
                    )
                  )}
                </Pressable>

                {due && (
                  <View style={styles.facts}>
                    <ThemedText
                      type="smallBold"
                      tabular
                      style={{
                        color:
                          due.status === 'overdue' || due.status === 'urgent'
                            ? theme.expense
                            : theme.warning,
                      }}>
                      Pay {formatAED(due.remainingFils, { decimals: false })} by{' '}
                      {shortDate(due.due.dueDate)}
                    </ThemedText>
                  </View>
                )}
              </Animated.View>
            );
          };
          return (
            <>
              {activeCards.map((c, i) => renderCard(c, i, false))}

              {inactiveCards.length > 0 && (
                <Pressable
                  onPress={() => setShowInactive((v) => !v)}
                  style={[styles.inactiveHeader, { borderColor: theme.cardBorder }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {t('inactiveCards')} ({inactiveCards.length})
                  </ThemedText>
                  <Icon
                    name={showInactive ? 'chevron-down' : 'chevron-right'}
                    size={16}
                    color={theme.textSecondary}
                  />
                </Pressable>
              )}
              {showInactive && inactiveCards.map((c, i) => renderCard(c, i, true))}
              {showInactive && inactiveCards.length > 0 && (
                <ThemedText type="micro" themeColor="textSecondary" style={styles.inactiveHint}>
                  No activity for 90+ days. Long-press a card to hide it for good or delete it.
                </ThemedText>
              )}
            </>
          );
          })()}

          {cards.length === 0 && (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
                <Icon name="wallet" size={26} color={theme.textSecondary} strokeWidth={1.7} />
              </View>
              <ThemedText type="smallBold">No cards yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Cards appear automatically when bank SMS mention them.
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Statements and payments for one card. Tapping a tile used to do
          nothing, so the pay-by date and what had actually been paid were
          only ever visible as a single line on the Bills tab. */}
      <Modal
        visible={detail !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: theme.cardBorder }]} />

            {detail && detailData && (
              <>
                <View style={styles.sheetHeader}>
                  <BankAvatar name={detail.bankName ?? detail.name} color={detail.color} size={40} />
                  <View style={styles.sheetTitle}>
                    <ThemedText type="heading" numberOfLines={1}>
                      {detail.bankName ?? detail.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" tabular>
                      {detail.cardType === 'credit' ? 'Credit' : 'Debit'}
                      {detail.last4 ? ` ·· ${detail.last4}` : ''}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => setDetail(null)} hitSlop={8}>
                    <Icon name="close" size={20} color={theme.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                  {/* Statements, newest first: the pay-by date the user asked for. */}
                  <ThemedText type="micro" themeColor="textSecondary">
                    STATEMENTS
                  </ThemedText>
                  {detailData.statements.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sheetEmpty}>
                      No statement message has arrived for this card yet.
                    </ThemedText>
                  ) : (
                    detailData.statements.map((d, i) => {
                      const settled = !!d.settledAt || d.paidFils >= d.totalDueFils;
                      return (
                        <View
                          key={d.id}
                          style={[
                            styles.sheetRow,
                            i > 0 && {
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.cardBorder,
                            },
                          ]}>
                          <View style={styles.sheetRowText}>
                            <ThemedText type="smallBold" tabular>
                              Due {shortDate(d.dueDate)}
                            </ThemedText>
                            <ThemedText type="micro" themeColor="textSecondary" tabular>
                              min {formatAED(d.minDueFils, { decimals: false })}
                            </ThemedText>
                          </View>
                          <View style={styles.sheetRowRight}>
                            <ThemedText type="smallBold" tabular>
                              {formatAED(d.totalDueFils, { decimals: false })}
                            </ThemedText>
                            <ThemedText
                              type="micro"
                              style={{ color: settled ? theme.income : theme.expense }}>
                              {settled ? 'Settled' : 'Open'}
                            </ThemedText>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {/* Payments made against the card. */}
                  <View style={styles.sheetSection}>
                    <View style={styles.sheetSectionHead}>
                      <ThemedText type="micro" themeColor="textSecondary">
                        PAYMENTS MADE
                      </ThemedText>
                      <ThemedText type="micro" themeColor="textSecondary" tabular>
                        {formatAED(detailData.paidTotal, { decimals: false })} total
                      </ThemedText>
                    </View>
                    {detailData.payments.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sheetEmpty}>
                        No payment to this card has been detected yet.
                      </ThemedText>
                    ) : (
                      detailData.payments.slice(0, 24).map((p, i) => (
                        <View
                          key={p.id}
                          style={[
                            styles.sheetRow,
                            i > 0 && {
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.cardBorder,
                            },
                          ]}>
                          <ThemedText type="small" tabular style={styles.sheetRowText}>
                            {shortDate(p.date)}
                          </ThemedText>
                          <ThemedText type="smallBold" tabular style={{ color: theme.income }}>
                            {formatAED(p.amountFils, { decimals: false })}
                          </ThemedText>
                        </View>
                      ))
                    )}
                  </View>
                </ScrollView>
              </>
            )}
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
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  tile: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.four,
    overflow: 'hidden',
  },
  tileWash: {
    ...StyleSheet.absoluteFillObject,
  },
  /** A single brand stripe reads as identity; the old corner circle read as a crop artifact. */
  tileEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  tileTopText: {
    flex: 1,
    gap: 1,
  },
  dueChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  tileMiddle: {
    gap: 2,
  },
  tileFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  inactiveTile: {
    opacity: 0.55,
  },
  inactiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inactiveHint: {
    opacity: 0.8,
    marginTop: -Spacing.two,
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
    maxHeight: '82%',
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
    gap: Spacing.two + 2,
  },
  sheetTitle: {
    flex: 1,
    gap: 1,
  },
  sheetScroll: {
    marginHorizontal: -Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  sheetSection: {
    marginTop: Spacing.four,
    gap: Spacing.one,
  },
  sheetSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 2,
  },
  sheetRowText: {
    flex: 1,
    gap: 1,
  },
  sheetRowRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  sheetEmpty: {
    paddingVertical: Spacing.three,
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
});
