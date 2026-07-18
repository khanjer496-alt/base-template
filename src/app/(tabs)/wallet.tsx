import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAED, parseAmountToFils } from '@/lib/format';
import { accountBalanceFils, netWorthFils, useStore } from '@/lib/store';
import type { AccountKind } from '@/lib/types';

const TAB_BAR_CLEARANCE = 110;

const KIND_META: Record<AccountKind, { label: string; emoji: string }> = {
  bank: { label: 'Bank account', emoji: '🏦' },
  card: { label: 'Card', emoji: '💳' },
  cash: { label: 'Cash', emoji: '💵' },
};

const ACCOUNT_COLORS = ['#2DD4A8', '#60A5FA', '#E9B949', '#F472B6', '#A78BFA', '#FB923C'];

export default function WalletScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, addAccount, deleteAccount, setAppLock, loadDemoData, clearAll } = useStore();

  const [adderVisible, setAdderVisible] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [openingText, setOpeningText] = useState('');
  const [colorIdx, setColorIdx] = useState(0);

  const total = netWorthFils(state);

  const saveAccount = () => {
    if (!name.trim()) return;
    const opening = parseAmountToFils(openingText) ?? 0;
    addAccount({
      name: name.trim(),
      kind,
      openingFils: opening,
      color: ACCOUNT_COLORS[colorIdx],
    });
    setName('');
    setOpeningText('');
    setAdderVisible(false);
  };

  const confirmDeleteAccount = (id: string, accName: string) => {
    Alert.alert(
      'Remove account?',
      `"${accName}" and all its transactions will be deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteAccount(id) },
      ],
    );
  };

  const toggleAppLock = async (enabled: boolean) => {
    if (!enabled) {
      setAppLock(false);
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'App lock works on the phone app only.');
      return;
    }
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      Alert.alert(
        'No screen lock set up',
        'Set up a fingerprint, face unlock, or PIN in your phone settings first.',
      );
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to enable app lock',
    });
    if (result.success) setAppLock(true);
  };

  const exportCsv = () => {
    const header = 'date,type,amount_aed,category,title,account';
    const lines = state.transactions.map((t) => {
      const account = state.accounts.find((a) => a.id === t.accountId)?.name ?? '';
      const title = `"${t.title.replace(/"/g, '""')}"`;
      return `${t.date},${t.type},${(t.amountFils / 100).toFixed(2)},${t.category},${title},"${account}"`;
    });
    Share.share({
      title: 'wafra-export.csv',
      message: [header, ...lines].join('\n'),
    }).catch(() => {});
  };

  const confirmReset = (demo: boolean) => {
    Alert.alert(
      demo ? 'Load demo data?' : 'Erase everything?',
      demo
        ? 'This replaces your current data with the sample UAE dataset.'
        : 'All accounts, transactions and budgets will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: demo ? 'Load demo' : 'Erase',
          style: demo ? 'default' : 'destructive',
          onPress: demo ? loadDemoData : clearAll,
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View>
              <ThemedText style={styles.title}>Wallet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Net worth {formatAED(total, { decimals: false })}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setAdderVisible(true)}
              style={[styles.addBtn, { backgroundColor: theme.primary }]}>
              <Icon name="plus" size={20} color={theme.onPrimary} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {state.accounts.map((account, i) => {
              const balance = accountBalanceFils(state, account.id);
              const meta = KIND_META[account.kind];
              return (
                <Animated.View key={account.id} entering={FadeInDown.delay(i * 60).duration(350)}>
                  <Pressable onLongPress={() => confirmDeleteAccount(account.id, account.name)}>
                    <Card style={styles.accountCard}>
                      <View style={[styles.accountStripe, { backgroundColor: account.color }]} />
                      <View style={[styles.accountEmoji, { backgroundColor: `${account.color}22` }]}>
                        <ThemedText style={styles.accountEmojiText}>{meta.emoji}</ThemedText>
                      </View>
                      <View style={styles.accountInfo}>
                        <ThemedText type="smallBold">{account.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {meta.label}
                        </ThemedText>
                      </View>
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: balance >= 0 ? theme.text : theme.expense,
                          fontSize: 16,
                        }}>
                        {formatAED(balance, { decimals: false })}
                      </ThemedText>
                    </Card>
                  </Pressable>
                </Animated.View>
              );
            })}
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Long-press an account to remove it.
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Features</ThemedText>
            <Card style={styles.settingsCard}>
              <Pressable style={styles.settingRow} onPress={() => router.push('/bills')}>
                <ThemedText type="small">📅 Bills & subscriptions</ThemedText>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/import-sms')}>
                <ThemedText type="small">✉️ Import from bank SMS</ThemedText>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <View style={styles.settingRow}>
                <ThemedText type="small">🔒 App lock (biometric)</ThemedText>
                <Switch
                  value={state.appLock}
                  onValueChange={toggleAppLock}
                  trackColor={{ true: theme.primary, false: theme.track }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Data</ThemedText>
            <Card style={styles.settingsCard}>
              <Pressable style={styles.settingRow} onPress={exportCsv}>
                <ThemedText type="small">📤 Export transactions (CSV)</ThemedText>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={() => confirmReset(true)}>
                <ThemedText type="small">🧪 Load demo data</ThemedText>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={() => confirmReset(false)}>
                <ThemedText type="small" style={{ color: theme.expense }}>
                  🗑️ Erase all data
                </ThemedText>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            </Card>
          </View>

          <Card style={styles.aboutCard}>
            <ThemedText style={styles.aboutLogo}>وفرة</ThemedText>
            <ThemedText type="smallBold">Wafra — UAE Money Manager</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.aboutText}>
              Track spending in AED, set monthly budgets, and get plain-language analysis of
              where your money goes. All data stays on this device.
            </ThemedText>
          </Card>
        </ScrollView>
      </SafeAreaView>

      {/* Add account sheet */}
      <Modal visible={adderVisible} transparent animationType="fade" onRequestClose={() => setAdderVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdderVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>New account</ThemedText>
              <Pressable onPress={() => setAdderVisible(false)}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Account name (e.g. ADCB Savings)"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                { backgroundColor: theme.backgroundSelected, color: theme.text },
              ]}
            />

            <View style={styles.kindRow}>
              {(Object.keys(KIND_META) as AccountKind[]).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={[
                    styles.kindChip,
                    {
                      backgroundColor: kind === k ? `${theme.primary}22` : theme.backgroundSelected,
                      borderColor: kind === k ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small">
                    {KIND_META[k].emoji} {KIND_META[k].label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={[styles.amountBox, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">AED</ThemedText>
              <TextInput
                value={openingText}
                onChangeText={setOpeningText}
                keyboardType="numeric"
                placeholder="Opening balance (optional)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.amountInput, { color: theme.text }]}
              />
            </View>

            <View style={styles.colorRow}>
              {ACCOUNT_COLORS.map((c, i) => (
                <Pressable
                  key={c}
                  onPress={() => setColorIdx(i)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c, borderColor: colorIdx === i ? theme.text : 'transparent' },
                  ]}
                />
              ))}
            </View>

            <Pressable
              onPress={saveAccount}
              disabled={!name.trim()}
              style={[
                styles.saveBtn,
                { backgroundColor: theme.primary, opacity: name.trim() ? 1 : 0.45 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Add account</ThemedText>
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
  title: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: Spacing.two,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    overflow: 'hidden',
  },
  accountStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  accountEmoji: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmojiText: {
    fontSize: 20,
  },
  accountInfo: {
    flex: 1,
    gap: 1,
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
  },
  section: {
    gap: Spacing.two,
  },
  settingsCard: {
    paddingVertical: Spacing.one,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  aboutCard: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  aboutLogo: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '700',
  },
  aboutText: {
    textAlign: 'center',
    maxWidth: 300,
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
  kindRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  kindChip: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
  amountInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: Spacing.three,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
  },
  saveBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
