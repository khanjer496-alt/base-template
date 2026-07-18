/**
 * Wafra design tokens — dark-first premium fintech palette with light mode support.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    background: '#F4F6F9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EAEEF3',
    textSecondary: '#5B6676',
    card: '#FFFFFF',
    cardBorder: '#E5EAF0',
    primary: '#0FA382',
    primarySoft: '#DCF5EE',
    onPrimary: '#FFFFFF',
    gold: '#B98A22',
    goldSoft: '#F7EDD6',
    income: '#059669',
    expense: '#E11D48',
    warning: '#D97706',
    track: '#E8ECF1',
  },
  dark: {
    text: '#F2F5F8',
    background: '#0A0E13',
    backgroundElement: '#141B23',
    backgroundSelected: '#1D2733',
    textSecondary: '#8B95A5',
    card: '#141B23',
    cardBorder: '#212C39',
    primary: '#2DD4A8',
    primarySoft: '#12352E',
    onPrimary: '#04211A',
    gold: '#E9B949',
    goldSoft: '#33290F',
    income: '#34D399',
    expense: '#FB7185',
    warning: '#F5A524',
    track: '#222D3A',
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
