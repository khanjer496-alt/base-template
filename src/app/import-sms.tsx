import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MerchantAvatar } from '@/components/ui/merchant-avatar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { formatAED, shortDate, toISODate } from '@/lib/format';
import {
  isSmsScanningAvailable,
  requestSmsPermission,
  scanInboxForBankMessages,
} from '@/lib/sms-inbox';
import { parseSmsBatch, type ParsedSms } from '@/lib/sms-parser';
import { useStore } from '@/lib/store';

const SAMPLE = `Purchase of AED 187.50 with Debit Card ending 1234 at CARREFOUR MALL OF EMIRATES, DUBAI on 17/07/2026. Avl balance AED 12,345.67

AED 55.00 was debited from your account for payment to SALIK RECHARGE on 16/07/2026

Salary of AED 18,500.00 has been credited to your account ending 5678`;

export default function ImportSmsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { auto } = useLocalSearchParams<{ auto?: string }>();
  const { state, addTransaction, addBill } = useStore();

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedSms[] | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? '');
  const [scanning, setScanning] = useState(false);
  const [trackedBills, setTrackedBills] = useState<Set<number>>(new Set());

  // Accounts may hydrate (or change) after mount — keep a valid selection.
  useEffect(() => {
    if (!state.accounts.some((a) => a.id === accountId)) {
      setAccountId(state.accounts[0]?.id ?? '');
    }
  }, [state.accounts, accountId]);

  const txParsed = useMemo(() => (parsed ?? []).filter((p) => p.kind === 'transaction'), [parsed]);
  const billParsed = useMemo(() => {
    const existing = new Set(state.bills.map((b) => b.title.toLowerCase()));
    return (parsed ?? []).filter(
      (p) =>
        p.kind === 'billDue' &&
        p.merchant !== 'Bill payment' &&
        !existing.has(p.merchant.toLowerCase()),
    );
  }, [parsed, state.bills]);

  const selectedCount = txParsed.length - excluded.size;
  const allSelected = excluded.size === 0;

  const runParse = (input: string) => {
    setParsed(parseSmsBatch(input));
    setExcluded(new Set());
    setTrackedBills(new Set());
  };

  const scanInbox = useCallback(async () => {
    setScanning(true);
    try {
      const granted = await requestSmsPermission();
      if (!granted) {
        Alert.alert(
          'Permission needed',
          'Wafra needs SMS access to scan bank alerts. You can also paste messages manually below.',
        );
        return;
      }
      const found = await scanInboxForBankMessages(state.transactions);
      setParsed(found);
      setExcluded(new Set());
      setTrackedBills(new Set());
      if (found.length === 0) {
        Alert.alert(
          'Nothing new found',
          'No unrecorded bank messages in the last 90 days. Transactions you already imported are skipped automatically.',
        );
      }
    } finally {
      setScanning(false);
    }
  }, [state.transactions]);

  const toggle = (i: number) => {
    const next = new Set(excluded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExcluded(next);
  };

  const toggleAll = () => {
    setExcluded(allSelected ? new Set(txParsed.map((_, i) => i)) : new Set());
  };

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const importSelected = () => {
    if (!accountId) return;
    txParsed.forEach((p, i) => {
      if (excluded.has(i)) return;
      addTransaction({
        type: p.type,
        amountFils: p.amountFils,
        category: p.categoryGuess,
        accountId,
        title: p.merchant,
        date: p.date ?? todayISO,
      });
    });
    router.back();
  };

  useEffect(() => {
    if (auto === '1' && isSmsScanningAvailable()) {
      scanInbox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const header = (
    <View style={styles.headerContent}>
      <ThemedText type="small" themeColor="textSecondary">
        {isSmsScanningAvailable()
          ? 'Scan your inbox for bank alerts, or paste messages below (separate multiple messages with a blank line). Everything is processed on this device.'
          : 'Paste one or more bank alert messages below (separate multiple messages with a blank line). Everything is processed on this device.'}
      </ThemedText>

      {isSmsScanningAvailable() && (
        <Pressable
          onPress={scanInbox}
          disabled={scanning}
          style={[styles.scanBtn, { backgroundColor: theme.primary, opacity: scanning ? 0.6 : 1 }]}>
          <Icon name="search" size={19} color={theme.onPrimary} strokeWidth={2.4} />
          <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: 15 }}>
            {scanning ? 'Scanning inbox…' : 'Scan phone inbox (90 days)'}
          </ThemedText>
        </Pressable>
      )}

      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder={'Purchase of AED 187.50 with Debit Card ending 1234 at CARREFOUR…'}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.textarea,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.cardBorder,
            color: theme.text,
          },
        ]}
      />

      <View style={styles.parseRow}>
        <Pressable
          onPress={() => runParse(text)}
          disabled={!text.trim()}
          style={[
            styles.parseBtn,
            { backgroundColor: theme.backgroundSelected, opacity: text.trim() ? 1 : 0.5 },
          ]}>
          <ThemedText type="smallBold">Parse pasted text</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => {
            setText(SAMPLE);
            runParse(SAMPLE);
          }}
          style={[styles.sampleBtn, { borderColor: theme.cardBorder }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Try sample
          </ThemedText>
        </Pressable>
      </View>

      {parsed !== null && parsed.length === 0 && (
        <Card style={styles.emptyCard}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            No bank transactions found. Make sure you pasted the full message, including the AED
            amount.
          </ThemedText>
        </Card>
      )}

      {billParsed.length > 0 && (
        <View style={styles.fieldBlock}>
          <ThemedText type="smallBold">📅 Bill reminders detected</ThemedText>
          {billParsed.map((p, i) => {
            const meta = getCategory(p.categoryGuess);
            const tracked = trackedBills.has(i);
            return (
              <Card key={`bill-${i}`} style={styles.previewCard}>
                <MerchantAvatar title={p.merchant} category={p.categoryGuess} size={40} />
                <View style={styles.previewInfo}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {p.merchant}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {meta.label} · {formatAED(p.amountFils, { decimals: false })}
                    {p.dueDay ? ` · due day ${p.dueDay}` : ''}
                  </ThemedText>
                </View>
                <Pressable
                  disabled={tracked}
                  onPress={() => {
                    addBill({
                      title: p.merchant,
                      category: p.categoryGuess,
                      amountFils: p.amountFils,
                      dueDay: p.dueDay ?? (p.date ? Number(p.date.slice(8)) : 1),
                      autoDetected: true,
                    });
                    setTrackedBills(new Set(trackedBills).add(i));
                  }}
                  style={[
                    styles.trackBtn,
                    { backgroundColor: tracked ? `${theme.income}22` : `${theme.gold}22` },
                  ]}>
                  <ThemedText
                    type="small"
                    style={{ color: tracked ? theme.income : theme.gold, fontWeight: '700' }}>
                    {tracked ? '✓ Tracked' : 'Track'}
                  </ThemedText>
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}

      {txParsed.length > 0 && (
        <>
          <View style={styles.fieldBlock}>
            <ThemedText type="small" themeColor="textSecondary">
              Import into account
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accountRow}>
              {state.accounts.map((a) => {
                const active = accountId === a.id;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAccountId(a.id)}
                    style={[
                      styles.accountChip,
                      {
                        backgroundColor: active ? `${a.color}26` : theme.backgroundElement,
                        borderColor: active ? a.color : theme.cardBorder,
                      },
                    ]}>
                    <View style={[styles.accountDot, { backgroundColor: a.color }]} />
                    <ThemedText type="small">{a.name}</ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.selectRow}>
            <ThemedText type="smallBold">
              {selectedCount} of {txParsed.length} selected
            </ThemedText>
            <Pressable onPress={toggleAll}>
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </ThemedText>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  const renderRow = ({ item: p, index: i }: { item: ParsedSms; index: number }) => {
    const meta = getCategory(p.categoryGuess);
    const included = !excluded.has(i);
    return (
      <Pressable onPress={() => toggle(i)} style={styles.rowWrap}>
        <Card style={[styles.previewCard, !included && { opacity: 0.45 }]}>
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: included ? theme.primary : 'transparent',
                borderColor: included ? theme.primary : theme.textSecondary,
              },
            ]}>
            {included && <Icon name="check" size={13} color={theme.onPrimary} strokeWidth={3} />}
          </View>
          <MerchantAvatar title={p.merchant} category={p.categoryGuess} size={40} />
          <View style={styles.previewInfo}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {p.merchant}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {meta.label} · {p.date ? shortDate(p.date) : 'today'}
            </ThemedText>
          </View>
          <ThemedText
            type="smallBold"
            style={{ color: p.type === 'income' ? theme.income : theme.text }}>
            {p.type === 'income' ? '+' : '−'}
            {formatAED(p.amountFils, { decimals: false })}
          </ThemedText>
        </Card>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.backBtn, { backgroundColor: theme.backgroundSelected }]}>
              <Icon name="chevron-left" size={18} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold" style={styles.headerTitle}>
              Import from SMS
            </ThemedText>
            <View style={styles.backBtn} />
          </View>

          <FlatList
            data={txParsed}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderRow}
            extraData={excluded}
            ListHeaderComponent={header}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            maxToRenderPerBatch={16}
            windowSize={7}
          />

          {txParsed.length > 0 && (
            <View style={styles.footer}>
              <Pressable
                onPress={importSelected}
                disabled={selectedCount === 0 || !accountId}
                style={[
                  styles.importBtn,
                  {
                    backgroundColor: theme.primary,
                    opacity: selectedCount === 0 || !accountId ? 0.4 : 1,
                  },
                ]}>
                <Icon name="check" size={20} color={theme.onPrimary} strokeWidth={2.6} />
                <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: 16 }}>
                  Import {selectedCount} transaction{selectedCount === 1 ? '' : 's'}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
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
    paddingTop: 0,
  },
  headerContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
  },
  textarea: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    minHeight: 110,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  parseRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  parseBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
  },
  sampleBtn: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
  },
  emptyCard: {
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  fieldBlock: {
    gap: Spacing.two,
  },
  accountRow: {
    gap: Spacing.two,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowWrap: {
    marginBottom: Spacing.two,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: {
    flex: 1,
    gap: 1,
  },
  trackBtn: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    borderRadius: Radius.full,
  },
  footer: {
    padding: Spacing.three,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md + 2,
    paddingVertical: Spacing.three + 2,
  },
});
