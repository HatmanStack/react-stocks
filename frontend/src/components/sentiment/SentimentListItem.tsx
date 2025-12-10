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
import { formatPercentage } from '@/utils/formatting/numberFormatting';
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

  const formatPrediction = (
    direction?: 'up' | 'down',
    probability?: number,
    legacy?: number
  ): { text: string; isUp: boolean; isDown: boolean } => {
    if (direction && probability !== undefined) {
      const arrow = direction === 'up' ? '↑' : '↓';
      return {
        text: `${arrow}${formatPercentage(probability)}`,
        isUp: direction === 'up',
        isDown: direction === 'down',
      };
    }
    if (legacy && legacy !== 0) {
      return {
        text: formatPercentage(legacy / 100),
        isUp: legacy > 0,
        isDown: legacy < 0,
      };
    }
    return { text: '—', isUp: false, isDown: false };
  };

  const pred1D = formatPrediction(item.nextDayDirection, item.nextDayProbability, item.nextDay);
  const pred2W = formatPrediction(item.twoWeekDirection, item.twoWeekProbability, item.twoWks);
  const pred1M = formatPrediction(item.oneMonthDirection, item.oneMonthProbability, item.oneMnth);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant, borderBottomColor: theme.colors.outline }]}>
      <View style={styles.row}>
        {/* Date */}
        <View style={styles.dateColumn}>
          <Text variant="bodyMedium" style={[styles.text, { color: theme.colors.onSurface }]}>
            {formatShortDate(item.date)}
          </Text>
        </View>

        {/* Sentiment (ML Score) */}
        <View style={styles.valueColumn}>
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
        <View style={styles.valueColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={isScorePositive(item.avgAspectScore)}
            negative={isScoreNegative(item.avgAspectScore)}
          >
            {formatScore(item.avgAspectScore)}
          </MonoText>
        </View>

        {/* 1-Day Prediction */}
        <View style={styles.valueColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={pred1D.isUp}
            negative={pred1D.isDown}
          >
            {pred1D.text}
          </MonoText>
        </View>

        {/* 2-Week Prediction */}
        <View style={styles.valueColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={pred2W.isUp}
            negative={pred2W.isDown}
          >
            {pred2W.text}
          </MonoText>
        </View>

        {/* 1-Month Prediction */}
        <View style={styles.valueColumn}>
          <MonoText
            variant="price"
            style={styles.text}
            positive={pred1M.isUp}
            negative={pred1M.isDown}
          >
            {pred1M.text}
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
  valueColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 45,
  },
  text: {
    fontSize: 12,
  },
});
