import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon, type IconName } from '@/components/ui/icon';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAED } from '@/lib/format';
import {
  isBillingAvailable,
  PRO_PRICES,
  purchasePro,
  restorePro,
  TRIAL_DAYS,
  trialDaysLeft,
  type ProPlan,
} from '@/lib/purchases';
import { useStore } from '@/lib/store';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'spark',
    title: 'Automatic tracking',
    text: 'Bank SMS and app notifications become transactions, cards and dues by themselves.',
  },
  {
    icon: 'chart',
    title: 'Insights & subscriptions',
    text: 'Auto-detected subscriptions, due-date countdowns, plain-language insights.',
  },
  {
    icon: 'calendar',
    title: 'Salary-day months',
    text: 'Your money month starts on payday, not the 1st.',
  },
  {
    icon: 'download',
    title: 'Backup & restore',
    text: 'Move your full history to a new phone with one file.',
  },
];

/** Wafra Pro paywall. Purchases run through Google Play Billing on the
 *  Play build; side-load builds explain that and stay functional via the
 *  founder unlock in Settings. */
export default function ProScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, setPro } = useStore();
  const [plan, setPlan] = useState<ProPlan>('yearly');

  const buy = async () => {
    if (!isBillingAvailable()) {
      Alert.alert(
        'Available with the Play Store release',
        'Purchases go through Google Play billing, which only works when Wafra is installed ' +
          'from the Play Store. This build has every Pro feature unlockable from Settings.',
      );
      return;
    }
    if (await purchasePro(plan)) setPro(true);
  };

  const restore = async () => {
    if (!isBillingAvailable()) {
      Alert.alert('Nothing to restore', 'Purchases arrive with the Play Store release.');
      return;
    }
    if (await restorePro()) setPro(true);
    else Alert.alert('No purchase found', 'No previous Wafra Pro purchase on this Google account.');
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
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
            <View style={[styles.crown, { backgroundColor: `${theme.gold}22` }]}>
              <Icon name="diamond" size={30} color={theme.gold} strokeWidth={1.8} />
            </View>
            <ThemedText type="title">Wafra Pro</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.heroText}>
              {state.pro
                ? 'Active on this device. Thank you for supporting Wafra.'
                : trialDaysLeft(state) > 0
                  ? `Everything is free for your first ${TRIAL_DAYS} days — ${trialDaysLeft(state)} day${trialDaysLeft(state) === 1 ? '' : 's'} left. Keep it going:`
                  : 'Your free trial has ended and tracking is paused. Subscribe to keep Wafra working — your data never leaves your phone either way.'}
            </ThemedText>
            {!state.pro && trialDaysLeft(state) > 0 && (
              <View style={[styles.trialChip, { backgroundColor: `${theme.primary}1c` }]}>
                <ThemedText type="micro" style={{ color: theme.primary, fontWeight: '700' }}>
                  FREE TRIAL ACTIVE
                </ThemedText>
              </View>
            )}
          </Animated.View>

          <View style={styles.features}>
            {FEATURES.map((f, i) => (
              <Animated.View
                key={f.title}
                entering={FadeInDown.delay(80 + i * 60).duration(300)}
                style={styles.feature}>
                <View style={[styles.featureIcon, { backgroundColor: theme.backgroundSelected }]}>
                  <Icon name={f.icon} size={17} color={theme.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.featureInfo}>
                  <ThemedText type="smallBold">{f.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {f.text}
                  </ThemedText>
                </View>
              </Animated.View>
            ))}
          </View>

          {!state.pro && (
            <>
              <View style={styles.plans}>
                {(['yearly', 'monthly'] as ProPlan[]).map((p) => {
                  const selected = plan === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPlan(p)}
                      style={[
                        styles.plan,
                        {
                          backgroundColor: selected ? `${theme.primary}14` : theme.card,
                          borderColor: selected ? theme.primary : theme.cardBorder,
                        },
                      ]}>
                      <ThemedText type="micro" themeColor="textSecondary">
                        {p === 'yearly' ? 'YEARLY' : 'MONTHLY'}
                      </ThemedText>
                      <ThemedText type="subtitle" tabular style={{ fontWeight: '800' }}>
                        {formatAED(PRO_PRICES[p].fils)}
                      </ThemedText>
                      <ThemedText type="micro" themeColor="textSecondary">
                        {PRO_PRICES[p].caption}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable onPress={buy} style={[styles.cta, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: 16 }}>
                  Get Wafra Pro
                </ThemedText>
              </Pressable>
              <Pressable onPress={restore} style={styles.restore}>
                <ThemedText type="small" themeColor="textSecondary">
                  Restore purchase
                </ThemedText>
              </Pressable>
            </>
          )}
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
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  crown: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    textAlign: 'center',
    maxWidth: 300,
  },
  trialChip: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  features: {
    gap: Spacing.three,
  },
  feature: {
    flexDirection: 'row',
    gap: Spacing.two + 2,
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureInfo: {
    flex: 1,
    gap: 2,
  },
  plans: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  plan: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: 4,
    alignItems: 'center',
  },
  cta: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three + 2,
    alignItems: 'center',
  },
  restore: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
});
