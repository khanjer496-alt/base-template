import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';
import { useThemeName } from '@/hooks/use-theme';

/**
 * React Navigation ships its own palette. Override the surfaces it paints so
 * navigation chrome matches the app's tokens instead of drifting from them.
 */
const NavigationThemes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: Colors.light.background,
      card: Colors.light.backgroundElement,
      text: Colors.light.text,
      border: Colors.light.backgroundSelected,
      primary: Colors.light.link,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: Colors.dark.background,
      card: Colors.dark.backgroundElement,
      text: Colors.dark.text,
      border: Colors.dark.backgroundSelected,
      primary: Colors.dark.link,
    },
  },
} satisfies Record<'light' | 'dark', Theme>;

export default function RootLayout() {
  const themeName = useThemeName();

  return (
    <ThemeProvider value={NavigationThemes[themeName]}>
      <StatusBar style="auto" />
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
