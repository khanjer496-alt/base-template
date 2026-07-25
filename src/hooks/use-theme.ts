/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The resolved theme name. `useColorScheme()` can also report `unspecified`
 * (native) or `null` (react-native-web before the media query resolves); both
 * fall back to light so callers never have to handle an absent scheme.
 */
export function useThemeName(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** The color palette for the active theme. */
export function useTheme() {
  return Colors[useThemeName()];
}
