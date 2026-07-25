import React from 'react';

import { CategoryAvatar } from '@/components/ui/category-avatar';
import type { CategoryId } from '@/lib/types';

interface MerchantAvatarProps {
  title: string;
  category: CategoryId;
  size?: number;
}

/**
 * Category mark for a transaction row, drawn locally.
 *
 * This used to fetch the merchant's favicon by domain, which sent the
 * merchant name — read out of a bank SMS — to a third-party logo host on
 * every row, along with the device's IP. That is spending history leaving
 * the phone, which contradicts the app's core promise and is the data flow
 * Play's SMS policy restricts for money-management apps. The category avatar
 * carries the same recognition value with nothing leaving the device.
 */
export function MerchantAvatar({ category, size = 44 }: MerchantAvatarProps) {
  return <CategoryAvatar category={category} size={size} />;
}
