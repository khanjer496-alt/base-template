import { Image } from 'expo-image';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CategoryAvatar } from '@/components/ui/category-avatar';
import { useTheme } from '@/hooks/use-theme';
import { merchantLogoUrl } from '@/lib/merchant-logos';
import type { CategoryId } from '@/lib/types';

interface MerchantAvatarProps {
  title: string;
  category: CategoryId;
  size?: number;
}

/**
 * Shows the merchant's logo (fetched at runtime by domain) when we recognise
 * the merchant. The category emoji is shown until the logo has actually
 * loaded, so offline devices and unknown merchants degrade gracefully.
 */
export function MerchantAvatar({ title, category, size = 44 }: MerchantAvatarProps) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = merchantLogoUrl(title);

  if (!url || failed) {
    return <CategoryAvatar category={category} size={size} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      {!loaded && <CategoryAvatar category={category} size={size} />}
      <View
        style={[
          styles.circle,
          loaded ? null : styles.hidden,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#FFFFFF',
            borderColor: theme.cardBorder,
          },
        ]}>
        <Image
          source={{ uri: url }}
          style={{ width: size * 0.55, height: size * 0.55 }}
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
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
  },
});
