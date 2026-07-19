import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
import { Icon } from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { WafraLogo } from '@/components/wafra-logo';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openDues } from '@/lib/cards';
import { formatAED, monthKey, parseAmountToFils, shortDate, toISODate } from '@/lib/format';
import { accountBalanceFils, netWorthFils, useStore } from '@/lib/store';
import type { AccountKind } from '@/lib/types';

const TAB_BAR_CLEARANCE = 110;

const KIND_META: Record<AccountKind, { label: string; icon: import('@/components/ui/icon').IconName }> = {
  bank: { label: 'Bank', icon: 'bank' },
  card: { label: 'Card', icon: 'wallet' },
  cash: { label: 'Cash', icon: 'cash' },
};

const ACCOUNT_COLORS = ['#2DD4A8', '#60A5FA', '#E3B54A', '#F472B6', '#A78BFA', '#FB923C'];
const GOAL_ICONS: import('@/components/ui/icon').IconName[] = [
  'target', 'plane', 'home', 'gift', 'car', 'cap', 'diamond', 'chart',
];
const isIconName = (v: string): v is (typeof GOAL_ICONS)[number] =>
  (GOAL_ICONS as string[]).includes(v);

export default function WalletScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    state,
    addAccount,
    deleteAccount,
    payCardDue,
    addGoal,
    editGoal,
    deleteGoal,
    setAppLock,
    exportBackup,
    restoreBackup,
    loadDemoData,
    clearAll,
  } = useStore();

  const now = useMemo(() => new Date(), []);
  const todayISO = toISODate(now);

  const [adderVisible, setAdderVisible] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [openingText, setOpeningText] = useState('');
  const [colorIdx, setColorIdx] = useState(0);

  const [goalVisible, setGoalVisible] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalIcon, setGoalIcon] = useState(GOAL_ICONS[0]);

  const total = netWorthFils(state);
  const dues = useMemo(() => openDues(state, now), [state, now]);

  // Cards (auto-discovered from SMS or added manually) get their own section.
  const cards = useMemo(
    () => state.accounts.filter((a) => a.kind === 'card' || a.cardType),
    [state.accounts],
  );
  const nonCardAccounts = useMemo(
    () => state.accounts.filter((a) => a.kind !== 'card' && !a.cardType),
    [state.accounts],
  );
  // This month's spend per account, for the per-card line.
  const monthSpendByAccount = useMemo(() => {
    const key = monthKey(now);
    const map = new Map<string, number>();
    for (const t of state.transactions) {
      if (t.type !== 'expense' || t.isTransfer || monthKey(t.date) !== key) continue;
      map.set(t.accountId, (map.get(t.accountId) ?? 0) + t.amountFils);
    }
    return map;
  }, [state.transactions, now]);

  const saveAccount = () => {
    if (!name.trim()) return;
    addAccount({
      name: name.trim(),
      kind,
      openingFils: parseAmountToFils(openingText) ?? 0,
      color: ACCOUNT_COLORS[colorIdx],
    });
    setName('');
    setOpeningText('');
    setAdderVisible(false);
  };

  const saveGoal = () => {
    const target = parseAmountToFils(goalTarget);
    if (!goalTitle.trim() || !target) return;
    addGoal({ title: goalTitle.trim(), emoji: goalIcon, targetFils: target, savedFils: 0 });
    setGoalTitle('');
    setGoalTarget('');
    setGoalVisible(false);
  };

  const addToGoal = (goalId: string, goalTitle2: string) => {
    if (Platform.OS === 'web') return;
    Alert.prompt?.(
      `Add to ${goalTitle2}`,
      'Amount in AED',
      (text) => {
        const fils = parseAmountToFils(text ?? '');
        const goal = state.goals.find((g) => g.id === goalId);
        if (fils && goal) editGoal(goalId, { savedFils: goal.savedFils + fils });
      },
      'plain-text',
      '',
      'numeric',
    ) ??
      // Android has no Alert.prompt: quick +100 with long-press hint
      (() => {
        const goal = state.goals.find((g) => g.id === goalId);
        if (goal) editGoal(goalId, { savedFils: goal.savedFils + 10_000 });
      })();
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

  const onPayDue = (dueId: string, remainingFils: number, accountId: string, accName: string) => {
    Alert.alert(
      `Pay ${accName}?`,
      `Marks ${formatAED(remainingFils, { decimals: false })} as paid and records the transfer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark paid',
          onPress: () =>
            payCardDue(
              dueId,
              remainingFils,
              {
                type: 'income',
                amountFils: remainingFils,
                category: 'other',
                accountId,
                title: `${accName} payment`,
                date: todayISO,
                source: 'manual',
                isTransfer: true,
              },
              true,
            ),
        },
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
    const header = 'date,type,amount_aed,category,title,account,transfer';
    const lines = state.transactions.map((t) => {
      const account = state.accounts.find((a) => a.id === t.accountId)?.name ?? '';
      const title = `"${t.title.replace(/"/g, '""')}"`;
      return `${t.date},${t.type},${(t.amountFils / 100).toFixed(2)},${t.category},${title},"${account}",${t.isTransfer ? 1 : 0}`;
    });
    Share.share({ title: 'wafra-export.csv', message: [header, ...lines].join('\n') }).catch(() => {});
  };

  const backupJson = () => {
    Share.share({ title: 'wafra-backup.json', message: exportBackup() }).catch(() => {});
  };

  const restoreFromFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      Alert.alert('Restore backup?', 'This replaces everything currently in the app.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            if (!restoreBackup(content)) {
              Alert.alert('Invalid file', 'That does not look like a Wafra backup.');
            }
          },
        },
      ]);
    } catch {
      Alert.alert('Could not read file', 'Try exporting a fresh backup and restoring that.');
    }
  };

  const confirmReset = (demo: boolean) => {
    Alert.alert(
      demo ? 'Load demo data?' : 'Erase everything?',
      demo
        ? 'This replaces your current data with the sample UAE dataset.'
        : 'All accounts, transactions, bills, and goals will be permanently deleted.',
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
              <ThemedText type="title">Wallet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" tabular>
                Net worth {formatAED(total, { decimals: false })}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setAdderVisible(true)}
              style={[styles.addBtn, { backgroundColor: theme.primary }]}>
              <Icon name="plus" size={20} color={theme.onPrimary} strokeWidth={2.4} />
            </Pressable>
          </View>

          {/* Card dues */}
          {dues.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="micro" themeColor="textSecondary">Card payments due</ThemedText>
              {dues.map(({ due, status, daysLeft, remainingFils, belowMinimum }) => {
                const account = state.accounts.find((a) => a.id === due.accountId);
                const urgent = status === 'urgent' || status === 'overdue';
                return (
                  <Animated.View key={due.id} entering={FadeInDown.duration(300)}>
                    <View style={styles.dueRow}>
                      <View style={styles.dueInfo}>
                        <ThemedText type="default">{account?.name ?? 'Card'}</ThemedText>
                        <ThemedText
                          type="small"
                          style={{ color: urgent ? theme.expense : theme.textSecondary }}>
                          {status === 'overdue'
                            ? `${-daysLeft}d overdue`
                            : `Pay by ${shortDate(due.dueDate)} · ${daysLeft}d left`}
                          {belowMinimum ? ` · min ${formatAED(due.minDueFils, { decimals: false })}` : ''}
                        </ThemedText>
                      </View>
                      <View style={styles.dueRight}>
                        <ThemedText type="smallBold" tabular style={urgent ? { color: theme.expense } : undefined}>
                          {formatAED(remainingFils, { decimals: false })}
                        </ThemedText>
                        <Pressable
                          onPress={() =>
                            onPayDue(due.id, remainingFils, due.accountId, account?.name ?? 'Card')
                          }>
                          <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                            Mark paid
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {/* Cards */}
          {cards.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="micro" themeColor="textSecondary">
                Cards ({cards.length})
              </ThemedText>
              <View>
                {cards.map((account, i) => {
                  const balance = accountBalanceFils(state, account.id);
                  const isCredit = account.cardType === 'credit';
                  // The bank's own quoted figure beats our derived one.
                  const snap = account.snapshotFils;
                  const display =
                    snap !== undefined && isCredit && account.snapshotKind === 'outstanding'
                      ? snap
                      : snap !== undefined && !isCredit && account.snapshotKind === 'balance'
                        ? snap
                        : isCredit
                          ? Math.abs(Math.min(0, balance))
                          : balance;
                  const availableLimit =
                    isCredit && account.snapshotKind === 'limit' ? (account.snapshotFils ?? null) : null;
                  const spent = monthSpendByAccount.get(account.id) ?? 0;
                  return (
                    <Pressable
                      key={account.id}
                      onLongPress={() => confirmDeleteAccount(account.id, account.name)}
                      style={[
                        styles.accountRow,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder },
                      ]}>
                      <View style={[styles.accountBadge, { backgroundColor: `${account.color}22` }]}>
                        <Icon name="wallet" size={20} color={account.color} strokeWidth={1.8} />
                      </View>
                      <View style={styles.accountInfo}>
                        <ThemedText type="default" numberOfLines={1}>
                          {account.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {isCredit ? 'Credit card' : 'Debit card'}
                          {account.last4 ? ` ••${account.last4}` : ''}
                          {availableLimit !== null
                            ? ` · ${formatAED(availableLimit, { decimals: false })} limit left`
                            : ''}
                          {spent > 0 ? ` · ${formatAED(spent, { decimals: false })} this month` : ''}
                        </ThemedText>
                      </View>
                      <View style={styles.accountRight}>
                        <ThemedText
                          type="smallBold"
                          tabular
                          style={{
                            color: isCredit && display > 0 ? theme.expense : theme.text,
                            fontSize: 15,
                          }}>
                          {formatAED(display, { decimals: false })}
                        </ThemedText>
                        {isCredit && (
                          <ThemedText type="micro" themeColor="textSecondary">
                            outstanding
                          </ThemedText>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Accounts */}
          <View style={styles.section}>
            <ThemedText type="micro" themeColor="textSecondary">Accounts</ThemedText>
            <View>
              {nonCardAccounts.map((account, i) => {
                const derived = accountBalanceFils(state, account.id);
                const fromBank = account.snapshotKind === 'balance' && account.snapshotFils !== undefined;
                const balance = fromBank ? account.snapshotFils! : derived;
                const meta = KIND_META[account.kind];
                return (
                  <Pressable
                    key={account.id}
                    onLongPress={() => confirmDeleteAccount(account.id, account.name)}
                    style={[
                      styles.accountRow,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder },
                    ]}>
                    <View style={[styles.accountBadge, { backgroundColor: `${account.color}22` }]}>
                      <Icon name={meta.icon} size={20} color={account.color} strokeWidth={1.8} />
                    </View>
                    <View style={styles.accountInfo}>
                      <ThemedText type="default" numberOfLines={1}>
                        {account.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {meta.label}
                        {account.last4 ? ` ••${account.last4}` : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.accountRight}>
                      <ThemedText type="smallBold" tabular style={{ fontSize: 15 }}>
                        {formatAED(balance, { decimals: false })}
                      </ThemedText>
                      {fromBank && (
                        <ThemedText type="micro" themeColor="textSecondary">
                          per bank SMS
                        </ThemedText>
                      )}
                    </View>
                  </Pressable>
                );
              })}
              {nonCardAccounts.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No bank or cash accounts yet.
                </ThemedText>
              )}
            </View>
            <ThemedText type="micro" themeColor="textSecondary" style={styles.hint}>
              Long-press a card or account to remove it
            </ThemedText>
          </View>

          {/* Goals */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="micro" themeColor="textSecondary">Savings goals</ThemedText>
              <Pressable onPress={() => setGoalVisible(true)}>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700' }}>
                  + New goal
                </ThemedText>
              </Pressable>
            </View>
            {state.goals.map((goal) => {
              const ratio = goal.targetFils > 0 ? goal.savedFils / goal.targetFils : 0;
              return (
                <Pressable
                  key={goal.id}
                  onPress={() => addToGoal(goal.id, goal.title)}
                  onLongPress={() =>
                    Alert.alert('Delete goal?', goal.title, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(goal.id) },
                    ])
                  }
                  style={styles.goalRow}>
                  <View style={styles.goalTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Icon
                        name={isIconName(goal.emoji) ? goal.emoji : 'target'}
                        size={14}
                        color={theme.gold}
                      />
                      <ThemedText type="small">{goal.title}</ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" tabular>
                      {formatAED(goal.savedFils, { decimals: false })} / {formatAED(goal.targetFils, { decimals: false })}
                    </ThemedText>
                  </View>
                  <ProgressBar ratio={ratio} color={ratio >= 1 ? theme.income : theme.gold} height={6} />
                </Pressable>
              );
            })}
            {state.goals.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Save toward something with + New goal.
              </ThemedText>
            )}
            {state.goals.length > 0 && (
              <ThemedText type="micro" themeColor="textSecondary" style={styles.hint}>
                Tap a goal to add AED 100 · long-press to delete
              </ThemedText>
            )}
          </View>

          {/* Features */}
          <View style={styles.section}>
            <ThemedText type="micro" themeColor="textSecondary">Features</ThemedText>
            <View>
              <Pressable style={styles.settingRow} onPress={() => router.push('/bills')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="calendar" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">Bills and subscriptions</ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/import-sms')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="mail" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">Import from bank SMS</ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <View style={styles.settingRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="lock" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">App lock (biometric)</ThemedText>
                </View>
                <Switch
                  value={state.appLock}
                  onValueChange={toggleAppLock}
                  trackColor={{ true: theme.primary, false: theme.track }}
                  thumbColor={theme.background}
                />
              </View>
            </View>
          </View>

          {/* Data */}
          <View style={styles.section}>
            <ThemedText type="micro" themeColor="textSecondary">Data</ThemedText>
            <View>
              <Pressable style={styles.settingRow} onPress={backupJson}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="download" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">Back up everything (JSON)</ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={restoreFromFile}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="upload" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">Restore from backup</ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={exportCsv}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="receipt" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">Export transactions (CSV)</ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={() => confirmReset(true)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="spark" size={15} color={theme.textSecondary} />
                  <ThemedText type="small">Load demo data</ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Pressable style={styles.settingRow} onPress={() => confirmReset(false)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="trash" size={15} color={theme.expense} />
                  <ThemedText type="small" style={{ color: theme.expense }}>
                    Erase all data
                  </ThemedText>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.about}>
            <WafraLogo markSize={36} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.aboutText}>
              Know where it goes. Watch it grow. All data stays on this device.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Add account sheet */}
      <Modal visible={adderVisible} transparent animationType="fade" onRequestClose={() => setAdderVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdderVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="heading">New account</ThemedText>
              <Pressable onPress={() => setAdderVisible(false)}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Account name (e.g. ADCB Savings)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={KIND_META[k].icon} size={13} color={theme.text} />
                    <ThemedText type="small">{KIND_META[k].label}</ThemedText>
                  </View>
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
              style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: name.trim() ? 1 : 0.45 }]}>
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Add account</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* New goal sheet */}
      <Modal visible={goalVisible} transparent animationType="fade" onRequestClose={() => setGoalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGoalVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="heading">New goal</ThemedText>
              <Pressable onPress={() => setGoalVisible(false)}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={goalTitle}
              onChangeText={setGoalTitle}
              placeholder="Goal (e.g. Umrah trip, new car)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            />

            <View style={[styles.amountBox, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">AED</ThemedText>
              <TextInput
                value={goalTarget}
                onChangeText={setGoalTarget}
                keyboardType="numeric"
                placeholder="Target amount"
                placeholderTextColor={theme.textSecondary}
                style={[styles.amountInput, { color: theme.text }]}
              />
            </View>

            <View style={styles.colorRow}>
              {GOAL_ICONS.map((ic) => (
                <Pressable
                  key={ic}
                  onPress={() => setGoalIcon(ic)}
                  style={[
                    styles.emojiPick,
                    {
                      backgroundColor: goalIcon === ic ? `${theme.primary}22` : theme.backgroundSelected,
                      borderColor: goalIcon === ic ? theme.primary : 'transparent',
                    },
                  ]}>
                  <Icon name={ic} size={19} color={goalIcon === ic ? theme.primary : theme.textSecondary} />
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={saveGoal}
              disabled={!goalTitle.trim() || !parseAmountToFils(goalTarget)}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: theme.primary,
                  opacity: !goalTitle.trim() || !parseAmountToFils(goalTarget) ? 0.45 : 1,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Create goal</ThemedText>
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
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  dueInfo: {
    flex: 1,
    gap: 1,
  },
  dueRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + 3,
  },
  accountBadge: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountBadgeEmoji: {
    fontSize: 19,
  },
  accountInfo: {
    flex: 1,
    gap: 1,
  },
  accountRight: {
    alignItems: 'flex-end',
  },
  hint: {
    opacity: 0.8,
  },
  goalRow: {
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one + 2,
  },
  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  about: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  aboutText: {
    textAlign: 'center',
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
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
  },
  emojiPick: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  emojiText: {
    fontSize: 20,
  },
  saveBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
