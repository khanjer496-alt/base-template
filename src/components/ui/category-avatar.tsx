import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getCategory } from '@/lib/categories';
import type { CategoryId } from '@/lib/types';

interface CategoryAvatarProps {
  category: CategoryId;
  size?: number;
}

/** Emoji badge tinted with the category color. */
export function CategoryAvatar({ category, size = 44 }: CategoryAvatarProps) {
  const meta = getCategory(category);
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${meta.color}26`,
        },
      ]}>
      <Text style={{ fontSize: size * 0.45 }}>{meta.emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
