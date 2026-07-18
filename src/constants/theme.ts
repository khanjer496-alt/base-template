/**
 * Wafra design tokens — dark-first premium fintech palette with light mode support.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Every neutral is tinted toward the emerald brand hue — no pure black or
 * white anywhere. Accent (primary) stays under ~10% of any surface.
 */
export const Colors = {
  light: {
    text: '#13201B',
    background: '#F3F6F4',
    backgroundElement: '#FBFDFC',
    backgroundSelected: '#E7EDEA',
    textSecondary: '#5C6B63',
    card: '#FBFDFC',
    cardBorder: '#E1E8E4',
    primary: '#0E9F7F',
    primarySoft: '#DBF2EA',
    onPrimary: '#F2FBF7',
    gold: '#A98A2E',
    goldSoft: '#F5EEDA',
    income: '#0A8F63',
    expense: '#D9365B',
    warning: '#C27B12',
    track: '#E4EAE6',
  },
  dark: {
    text: '#EDF4F0',
    background: '#0B1210',
    backgroundElement: '#131B17',
    backgroundSelected: '#1C2721',
    textSecondary: '#8CA096',
    card: '#131B17',
    cardBorder: '#1F2A24',
    primary: '#2DD4A8',
    primarySoft: '#123129',
    onPrimary: '#07231B',
    gold: '#E3B54A',
    goldSoft: '#31290F',
    income: '#3DD68C',
    expense: '#F26D7E',
    warning: '#F0A62E',
    track: '#1E2923',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
