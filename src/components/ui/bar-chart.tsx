import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface BarGroup {
  label: string;
  /** Values in display order; each rendered as its own bar within the group. */
  values: { value: number; color: string }[];
}

interface BarChartProps {
  groups: BarGroup[];
  height?: number;
  highlightIndex?: number;
  /** When provided, each group becomes tappable. */
  onPressGroup?: (index: number) => void;
}

/** Grouped vertical bar chart built from plain views (no chart lib needed). */
export function BarChart({ groups, height = 140, highlightIndex, onPressGroup }: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value)));

  return (
    <View style={[styles.row, { height: height + 26 }]}>
      {groups.map((group, gi) => (
        <Pressable
          key={group.label + gi}
          disabled={!onPressGroup}
          onPress={() => onPressGroup?.(gi)}
          style={styles.group}>
          <View style={[styles.bars, { height }]}>
            {group.values.map((v, vi) => (
              <Animated.View
                key={vi}
                entering={FadeInUp.delay(gi * 60 + vi * 40).springify()}
                style={[
                  styles.bar,
                  {
                    height: Math.max(4, (v.value / max) * height),
                    backgroundColor: v.color,
                    opacity: highlightIndex === undefined || highlightIndex === gi ? 1 : 0.35,
                  },
                ]}
              />
            ))}
          </View>
          <ThemedText
            type="small"
            themeColor={highlightIndex === gi ? 'text' : 'textSecondary'}
            style={styles.label}>
            {group.label}
          </ThemedText>
        </Pressable>
      ))}
      <View style={[styles.baseline, { backgroundColor: theme.cardBorder }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  group: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  bar: {
    width: 12,
    borderRadius: Radius.sm / 2,
  },
  label: {
    fontSize: 12,
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 25,
    height: StyleSheet.hairlineWidth,
  },
});
