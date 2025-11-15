/**
 * News List Item Skeleton Component
 * Placeholder for news items during loading
 * Matches the structure of the redesigned NewsListItem
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from 'react-native-paper';
import { Skeleton } from '@/components/common';
import { useLayoutDensity } from '@/hooks';

export function NewsListItemSkeleton() {
  const { cardSpacing, cardPadding } = useLayoutDensity();

  return (
    <Card
      style={[
        styles.card,
        {
          marginHorizontal: 12,
          marginVertical: cardSpacing * 0.67,
        },
      ]}
    >
      <Card.Content style={{ padding: cardPadding }}>
        {/* Headline - 2 lines */}
        <Skeleton width="90%" height={16} borderRadius={4} />
        <Skeleton width="75%" height={16} borderRadius={4} style={{ marginTop: 4 }} />

        {/* Publisher + Date */}
        <Skeleton width={120} height={12} borderRadius={4} style={{ marginTop: 8 }} />

        {/* Description - 2 lines */}
        <Skeleton width="100%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
        <Skeleton width="80%" height={14} borderRadius={4} style={{ marginTop: 4 }} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // Dynamic margins set via inline styles
  },
});
