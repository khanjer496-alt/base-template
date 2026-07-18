import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { StoreProvider } from '@/lib/store';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const palette = Colors[dark ? 'dark' : 'light'];

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme.colors : DefaultTheme.colors),
      background: palette.background,
      card: palette.card,
      text: palette.text,
      border: palette.cardBorder,
      primary: palette.primary,
    },
  };

  return (
    <StoreProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="add-transaction"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="transactions" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="import-sms" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </ThemeProvider>
    </StoreProvider>
  );
}
