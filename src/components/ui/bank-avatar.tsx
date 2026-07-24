import { Image } from 'expo-image';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { merchantLogoUrl } from '@/lib/merchant-logos';

interface BankAvatarProps {
  /** Bank name (or account name) used to resolve the logo. */
  name: string;
  /** Account color for the fallback badge. */
  color: string;
  icon?: IconName;
  size?: number;
}

/**
 * Bank logo badge for account/card rows. Fetches the bank's favicon at
 * runtime; until it loads (or when the bank is unknown / device offline)
 * the tinted icon badge shows instead, so nothing ever looks broken.
 */
export function BankAvatar({ name, color, icon = 'wallet', size = 42 }: BankAvatarProps) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = merchantLogoUrl(name);
  const radius = Math.round(size * 0.31);

  const fallback = (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: radius, backgroundColor: `${color}22` },
      ]}>
      <Icon name={icon} size={Math.round(size * 0.48)} color={color} strokeWidth={1.8} />
    </View>
  );

  if (!url || failed) return fallback;

  return (
    <View style={{ width: size, height: size }}>
      {!loaded && fallback}
      <View
        style={[
          styles.badge,
          styles.logo,
          loaded ? null : styles.hidden,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: '#FFFFFF',
            borderColor: theme.cardBorder,
          },
        ]}>
        <Image
          source={{ uri: url }}
          style={{ width: size * 0.6, height: size * 0.6 }}
          contentFit="contain"
          transition={150}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
  },
});
