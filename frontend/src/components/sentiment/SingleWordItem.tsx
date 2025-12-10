/**
 * Single Word Item
 * Displays per-article sentiment analysis with source and ML metrics
 */

import React from 'react';
import { View, StyleSheet, Linking, Pressable } from 'react-native';
import { Card, Text, Chip, IconButton } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { WordCountDetails } from '@/types/database.types';
import { formatShortDate } from '@/utils/date/dateUtils';

interface SingleWordItemProps {
  item: WordCountDetails;
}

// Event type display labels (excluding GENERAL which is too common)
const EVENT_TYPE_LABELS: Record<string, string> = {
  EARNINGS: 'Earnings',
  'M&A': 'M&A',
  GUIDANCE: 'Guidance',
  ANALYST_RATING: 'Analyst',
  PRODUCT_LAUNCH: 'Product',
};

export const SingleWordItem: React.FC<SingleWordItemProps> = React.memo(({ item }) => {
  const theme = useAppTheme();

  // Check if we have ML scores
  const hasAspectScore = item.aspectScore !== undefined && item.aspectScore !== null;
  const hasMlScore = item.mlScore !== undefined && item.mlScore !== null;

  // Get sentiment color from score
  const getSentimentColor = (score: number): string => {
    if (score > 0.1) return theme.colors.positive;
    if (score < -0.1) return theme.colors.negative;
    return theme.colors.neutral;
  };

  // Format score with sign (for accessibility)
  const formatScore = (score: number): string => {
    const sign = score > 0 ? '+' : '';
    return `${sign}${score.toFixed(2)}`;
  };

  // Open article URL
  const handleOpenArticle = () => {
    if (item.url) {
      Linking.openURL(item.url);
    }
  };

  // Check if this is a material event (has ML model analysis)
  const isMaterialEvent = item.eventType && ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING'].includes(item.eventType);

  // Should show event type chip? Only for non-GENERAL events
  const showEventChip = item.eventType && item.eventType !== 'GENERAL' && EVENT_TYPE_LABELS[item.eventType];

  return (
    <Card style={styles.card}>
      <Card.Content>
        {/* Header Row: Source/Date (left) | Event Chip (center-right) | Aspect Score (right) */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {item.publisher && (
              <Text variant="labelMedium" style={[styles.publisher, { color: theme.colors.primary }]}>
                {item.publisher}
              </Text>
            )}
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatShortDate(item.date)}
            </Text>
          </View>

          {/* Event type chip (only for material/notable events) */}
          {showEventChip && (
            <Chip
              mode="outlined"
              compact
              style={[styles.eventChip, { borderColor: theme.colors.outline }]}
              textStyle={styles.chipText}
            >
              {EVENT_TYPE_LABELS[item.eventType!]}
            </Chip>
          )}

          {/* Aspect Score - colored by sentiment */}
          {hasAspectScore && (
            <Text
              variant="titleMedium"
              style={[styles.aspectScore, { color: getSentimentColor(item.aspectScore!) }]}
            >
              {formatScore(item.aspectScore!)}
            </Text>
          )}
        </View>

        {/* ML model score for material events */}
        {hasMlScore && isMaterialEvent && (
          <View style={styles.mlScoreRow}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              ML:
            </Text>
            <Text
              variant="labelMedium"
              style={[styles.mlScore, { color: getSentimentColor(item.mlScore!) }]}
            >
              {formatScore(item.mlScore!)}
            </Text>
          </View>
        )}

        {/* Article Title & Body */}
        {item.title && (
          <Text
            variant="titleSmall"
            style={[styles.title, { color: theme.colors.onSurface }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        )}
        <Text
          variant="bodySmall"
          style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
          numberOfLines={2}
        >
          {item.body || 'No description available'}
        </Text>

        {/* Link to article */}
        {item.url && (
          <Pressable onPress={handleOpenArticle} style={styles.linkRow}>
            <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
              Read full article
            </Text>
            <IconButton
              icon="open-in-new"
              size={14}
              iconColor={theme.colors.primary}
              style={styles.linkIcon}
            />
          </Pressable>
        )}
      </Card.Content>
    </Card>
  );
});

SingleWordItem.displayName = 'SingleWordItem';

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
  },
  publisher: {
    fontWeight: '600',
    marginBottom: 2,
  },
  eventChip: {
    height: 26,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  aspectScore: {
    fontWeight: 'bold',
    minWidth: 50,
    textAlign: 'right',
  },
  mlScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  mlScore: {
    fontWeight: '600',
  },
  title: {
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 20,
  },
  body: {
    lineHeight: 18,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkIcon: {
    margin: 0,
    marginLeft: -4,
  },
});
