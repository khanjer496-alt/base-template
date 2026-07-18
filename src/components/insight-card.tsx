import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Insight } from '@/lib/insights';

interface InsightCardProps {
  insight: Insight;
  width?: number;
}

export function InsightCard({ insight, width }: InsightCardProps) {
  const theme = useTheme();
  const accent =
    insight.tone === 'warning'
      ? theme.warning
      : insight.tone === 'positive'
        ? theme.income
        : theme.primary;

  return (
    <Card style={[styles.card, width !== undefined && { width }]}>
      <View style={styles.header}>
        <View style={[styles.iconBubble, { backgroundColor: `${accent}1e` }]}>
          <Icon name={insight.icon} size={18} color={accent} strokeWidth={1.8} />
        </View>
        <View style={[styles.dot, { backgroundColor: accent }]} />
      </View>
      <ThemedText type="smallBold" numberOfLines={2}>
        {insight.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        {insight.body}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flexShrink: 1,
  },
});
