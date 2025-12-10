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

  // Check if we have scores (only show aspect if non-zero)
  const hasAspectScore = item.aspectScore !== undefined && item.aspectScore !== null && item.aspectScore !== 0;
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

  // Should show event type chip? Only for non-GENERAL events
  const showEventChip = item.eventType && item.eventType !== 'GENERAL' && EVENT_TYPE_LABELS[item.eventType];

  return (
    <Card style={styles.card}>
      <Card.Content>
        {/* Header Row: Source/Date | Sentiment | Event Chip | Aspect - evenly spaced */}
        <View style={styles.headerRow}>
          {/* Column 1: Source/Date - left aligned */}
          <View style={styles.columnLeft}>
            {item.publisher && (
              <Text variant="labelMedium" style={[styles.publisher, { color: theme.colors.primary }]}>
                {item.publisher}
              </Text>
            )}
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatShortDate(item.date)}
            </Text>
          </View>

          {/* Column 2: Sentiment score (ML model) */}
          <View style={styles.column}>
            {hasMlScore && (
              <>
                <Text variant="labelSmall" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
                  Sentiment
                </Text>
                <Text
                  variant="titleMedium"
                  style={[styles.score, { color: getSentimentColor(item.mlScore!) }]}
                >
                  {formatScore(item.mlScore!)}
                </Text>
              </>
            )}
          </View>

          {/* Column 3: Event type chip */}
          <View style={styles.column}>
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
          </View>

          {/* Column 4: Aspect Score - right aligned */}
          <View style={styles.columnRight}>
            {hasAspectScore && (
              <>
                <Text variant="labelSmall" style={[styles.labelRight, { color: theme.colors.onSurfaceVariant }]}>
                  Aspect
                </Text>
                <Text
                  variant="titleMedium"
                  style={[styles.scoreRight, { color: getSentimentColor(item.aspectScore!) }]}
                >
                  {formatScore(item.aspectScore!)}
                </Text>
              </>
            )}
          </View>
        </View>

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
    marginBottom: 8,
  },
  columnLeft: {
    flex: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 36,
  },
  column: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  columnRight: {
    flex: 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 36,
  },
  publisher: {
    fontWeight: '600',
    marginBottom: 2,
  },
  label: {
    textAlign: 'center',
  },
  labelRight: {
    textAlign: 'right',
  },
  score: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scoreRight: {
    fontWeight: 'bold',
    textAlign: 'right',
  },
  eventChip: {
    height: 26,
  },
  chipText: {
    fontSize: 11,
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
