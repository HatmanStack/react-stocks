/**
 * Sentiment List Item
 * Displays a single day's sentiment data in a compact table row
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { CombinedWordDetails } from '@/types/database.types';
import { formatShortDate } from '@/utils/date/dateUtils';
import { MonoText } from '@/components/common';

interface SentimentListItemProps {
  item: CombinedWordDetails;
}

export const SentimentListItem: React.FC<SentimentListItemProps> = React.memo(({ item }) => {
  const theme = useAppTheme();

  const formatScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return '—';
    return score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
  };

  const isScorePositive = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score > 0.1;
  };

  const isScoreNegative = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score < -0.1;
  };

  const isSignalPositive = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score >= 0.7;
  };

  const isSignalNegative = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score <= 0.4;
  };

  const formatSignalScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return '—';
    return score.toFixed(2);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant, borderBottomColor: theme.colors.outline }]}>
      <View style={styles.row}>
        {/* Date */}
        <View style={styles.dateColumn}>
          <Text variant="bodyMedium" style={[styles.text, { color: theme.colors.onSurface }]}>
            {formatShortDate(item.date)}
          </Text>
        </View>

        {/* Signal Score */}
        <View style={styles.centerColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={isSignalPositive(item.avgSignalScore)}
            negative={isSignalNegative(item.avgSignalScore)}
          >
            {formatSignalScore(item.avgSignalScore)}
          </MonoText>
        </View>

        {/* Sentiment (ML Score) */}
        <View style={styles.centerColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={isScorePositive(item.avgMlScore)}
            negative={isScoreNegative(item.avgMlScore)}
          >
            {formatScore(item.avgMlScore)}
          </MonoText>
        </View>

        {/* Aspect Score */}
        <View style={styles.centerColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={isScorePositive(item.avgAspectScore)}
            negative={isScoreNegative(item.avgAspectScore)}
          >
            {formatScore(item.avgAspectScore)}
          </MonoText>
        </View>
      </View>
    </View>
  );
});

SentimentListItem.displayName = 'SentimentListItem';

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateColumn: {
    flex: 1.2,
    minWidth: 50,
  },
  centerColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: 45,
  },
  text: {
    fontSize: 12,
  },
});
