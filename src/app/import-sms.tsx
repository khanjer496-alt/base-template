import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
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
import { formatAED, toISODate } from '@/lib/format';
import { parseSmsBatch, type ParsedSms } from '@/lib/sms-parser';
import { useStore } from '@/lib/store';

const SAMPLE = `Purchase of AED 187.50 with Debit Card ending 1234 at CARREFOUR MALL OF EMIRATES, DUBAI on 17/07/2026. Avl balance AED 12,345.67

AED 55.00 was debited from your account for payment to SALIK RECHARGE on 16/07/2026

Salary of AED 18,500.00 has been credited to your account ending 5678`;

export default function ImportSmsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, addTransaction } = useStore();

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedSms[] | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? '');

  const selectedCount = parsed ? parsed.length - excluded.size : 0;

  const runParse = (input: string) => {
    setParsed(parseSmsBatch(input));
    setExcluded(new Set());
  };

  const toggle = (i: number) => {
    const next = new Set(excluded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExcluded(next);
  };

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const importSelected = () => {
    if (!parsed || !accountId) return;
    parsed.forEach((p, i) => {
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

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <ThemedText type="small" themeColor="textSecondary">
              Paste one or more bank alert messages below (separate multiple messages with a
              blank line). Wafra reads the amount, merchant, date, and direction, and guesses a
              category — nothing leaves your device.
            </ThemedText>

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
                  { backgroundColor: theme.primary, opacity: text.trim() ? 1 : 0.4 },
                ]}>
                <Icon name="spark" size={18} color={theme.onPrimary} />
                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                  Parse messages
                </ThemedText>
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
                  No AED amount found in that text. Make sure you pasted the full bank
                  message.
                </ThemedText>
              </Card>
            )}

            {parsed !== null && parsed.length > 0 && (
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

                <View style={styles.previewList}>
                  {parsed.map((p, i) => {
                    const meta = getCategory(p.categoryGuess);
                    const included = !excluded.has(i);
                    return (
                      <Pressable key={i} onPress={() => toggle(i)}>
                        <Card style={[styles.previewCard, !included && { opacity: 0.45 }]}>
                          <View
                            style={[
                              styles.checkbox,
                              {
                                backgroundColor: included ? theme.primary : 'transparent',
                                borderColor: included ? theme.primary : theme.textSecondary,
                              },
                            ]}>
                            {included && (
                              <Icon name="check" size={13} color={theme.onPrimary} strokeWidth={3} />
                            )}
                          </View>
                          <MerchantAvatar title={p.merchant} category={p.categoryGuess} size={40} />
                          <View style={styles.previewInfo}>
                            <ThemedText type="smallBold" numberOfLines={1}>
                              {p.merchant}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                              {meta.emoji} {meta.label}
                              {p.date ? ` · ${p.date}` : ' · today'}
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
                  })}
                </View>
              </>
            )}
          </ScrollView>

          {parsed !== null && parsed.length > 0 && (
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
    gap: Spacing.three,
  },
  textarea: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    minHeight: 140,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  previewList: {
    gap: Spacing.two,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
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
