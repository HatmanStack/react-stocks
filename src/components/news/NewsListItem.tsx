/**
 * News List Item
 * Displays a single news article with title, metadata, and description
 * Redesigned for dense, compact display
 */

import React from 'react';
import { View, StyleSheet, Linking, Alert } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { NewsDetails } from '@/types/database.types';
import { formatNewsDate } from '@/utils/formatting/dateFormatting';
import { useLayoutDensity } from '@/hooks';
import { AnimatedCard } from '@/components/common';

interface NewsListItemProps {
  item: NewsDetails;
}

export const NewsListItem: React.FC<NewsListItemProps> = React.memo(({ item }) => {
  const theme = useTheme();
  const { cardSpacing, cardPadding, fontSize } = useLayoutDensity();

  const handlePress = async () => {
    const url = item.articleUrl;

    if (!url) {
      Alert.alert('Error', 'No URL available for this article');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to open this article URL');
      }
    } catch (error) {
      console.error('Error opening URL:', error);
      Alert.alert('Error', 'Failed to open article in browser');
    }
  };

  return (
    <AnimatedCard
      onPress={handlePress}
      style={[
        styles.card,
        {
          marginHorizontal: 12,
          marginVertical: cardSpacing * 0.67, // Reduced spacing between cards
        },
      ]}
      accessibilityLabel={`News article: ${item.title}. Published by ${item.publisher} on ${formatNewsDate(item.articleDate)}`}
      accessibilityHint="Double tap to open article in browser"
      accessibilityRole="button"
    >
      <View style={{ padding: cardPadding }}>
          {/* Headline - 2 lines max, bold */}
          <Text
            variant="titleMedium"
            style={[
              styles.title,
              {
                color: theme.colors.onSurface,
                fontSize: fontSize.title - 1, // Reduced for density
                lineHeight: (fontSize.title - 1) * 1.3,
              },
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {/* Publisher + Date metadata */}
          <View style={styles.metadata}>
            <Text
              variant="bodySmall"
              style={[
                styles.publisher,
                {
                  color: theme.colors.primary,
                  fontSize: fontSize.caption,
                },
              ]}
            >
              {item.publisher}
            </Text>
            <Text
              variant="bodySmall"
              style={[
                styles.separator,
                {
                  color: theme.colors.onSurfaceVariant,
                  fontSize: fontSize.caption,
                },
              ]}
            >
              {' • '}
            </Text>
            <Text
              variant="bodySmall"
              style={[
                styles.date,
                {
                  color: theme.colors.onSurfaceVariant,
                  fontSize: fontSize.caption - 1, // Smaller date text
                },
              ]}
            >
              {formatNewsDate(item.articleDate)}
            </Text>
          </View>

          {/* Description - 2 lines max (reduced from 3) */}
          {item.articleDescription && (
            <Text
              variant="bodyMedium"
              style={[
                styles.description,
                {
                  color: theme.colors.onSurfaceVariant,
                  fontSize: fontSize.subtitle - 1, // Reduced for density
                  lineHeight: (fontSize.subtitle - 1) * 1.4,
                },
              ]}
              numberOfLines={2}
            >
              {item.articleDescription}
            </Text>
          )}
        </View>
      </AnimatedCard>
  );
});

NewsListItem.displayName = 'NewsListItem';

const styles = StyleSheet.create({
  card: {
    // Dynamic margins set via inline styles
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 6, // Reduced from 8
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6, // Reduced from 8
  },
  publisher: {
    fontWeight: '600',
  },
  separator: {
    marginHorizontal: 4, // Reduced from 6
  },
  date: {
    // Font size set dynamically
  },
  description: {
    // Font size and line height set dynamically
  },
});
