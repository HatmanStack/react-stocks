/**
 * Combined Word Item
 * Displays daily aggregated sentiment analysis with three-signal architecture
 *
 * **Phase 5 Update:** Now displays event distribution, aspect scores, and DistilFinBERT scores
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, useTheme, Chip, Divider } from 'react-native-paper';
import type { CombinedWordDetails, EventType } from '@/types/database.types';
import { formatShortDate } from '@/utils/date/dateUtils';
import { formatPercentage } from '@/utils/formatting/numberFormatting';

interface CombinedWordItemProps {
  item: CombinedWordDetails;
}

/**
 * Get display label for event type
 */
function getEventLabel(eventType: EventType): string {
  const labels: Record<EventType, string> = {
    EARNINGS: 'Earnings',
    'M&A': 'M&A',
    PRODUCT_LAUNCH: 'Product',
    ANALYST_RATING: 'Analyst',
    GUIDANCE: 'Guidance',
    GENERAL: 'General',
  };
  return labels[eventType];
}

/**
 * Get color for event type chip
 */
function getEventColor(eventType: EventType, theme: any): string {
  const colors: Record<EventType, string> = {
    EARNINGS: '#2196F3', // Blue
    'M&A': '#9C27B0', // Purple
    PRODUCT_LAUNCH: '#FF9800', // Orange
    ANALYST_RATING: '#4CAF50', // Green
    GUIDANCE: '#00BCD4', // Cyan
    GENERAL: theme.colors.surfaceVariant, // Gray
  };
  return colors[eventType];
}

/**
 * Get sentiment color based on score (-1 to +1)
 */
function getScoreColor(score: number, theme: any): string {
  if (score > 0.3) return theme.colors.positive;
  if (score < -0.3) return theme.colors.negative;
  return theme.colors.neutral;
}

/**
 * Get sentiment label based on score
 */
function getScoreLabel(score: number): string {
  if (score > 0.5) return 'Strong Positive';
  if (score > 0.2) return 'Positive';
  if (score > -0.2) return 'Neutral';
  if (score > -0.5) return 'Negative';
  return 'Strong Negative';
}

export const CombinedWordItem: React.FC<CombinedWordItemProps> = React.memo(({ item }) => {
  const theme = useTheme();
  const [showLegacyMetrics, setShowLegacyMetrics] = useState(false);

  // Parse eventCounts from JSON string
  const eventCounts = item.eventCounts ? JSON.parse(item.eventCounts) : null;

  // Get sentiment color
  const getSentimentColor = (sentiment: string): string => {
    switch (sentiment) {
      case 'POS':
        return theme.colors.positive;
      case 'NEG':
        return theme.colors.negative;
      default:
        return theme.colors.neutral;
    }
  };

  // Get prediction color based on direction
  const getPredictionDirectionColor = (direction?: 'up' | 'down'): string => {
    if (direction === 'up') return theme.colors.positive;
    if (direction === 'down') return theme.colors.negative;
    return theme.colors.onSurfaceVariant;
  };

  // Legacy prediction color (backward compatibility)
  const getLegacyPredictionColor = (value: number): string => {
    return value >= 0 ? theme.colors.positive : theme.colors.negative;
  };

  const sentimentColor = getSentimentColor(item.sentiment);

  // Helper to render prediction with new format (Phase 2) or legacy format
  const renderPrediction = (
    direction: 'up' | 'down' | undefined,
    probability: number | undefined,
    legacyValue: number
  ) => {
    if (direction && probability !== undefined) {
      // New format: ↑ 72%
      const arrow = direction === 'up' ? '↑' : '↓';
      const color = getPredictionDirectionColor(direction);
      return (
        <Text variant="bodyLarge" style={{ color, fontWeight: 'bold' }}>
          {arrow} {formatPercentage(probability)}
        </Text>
      );
    }

    // Legacy format: 0.5% (if non-zero) or placeholder
    if (legacyValue !== 0) {
        return (
            <Text
              variant="bodyLarge"
              style={{ color: getLegacyPredictionColor(legacyValue), fontWeight: 'bold' }}
            >
              {formatPercentage(legacyValue / 100)}
            </Text>
        );
    }

    // Placeholder
    return (
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          —
        </Text>
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Content>
        {/* Date and Sentiment */}
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.date}>
            {formatShortDate(item.date)}
          </Text>
          <Chip
            mode="flat"
            style={[styles.sentimentChip, { backgroundColor: sentimentColor }]}
            textStyle={[styles.sentimentText, { color: theme.colors.surface }]}
          >
            {item.sentiment}
          </Chip>
        </View>

        {/* Phase 5: Event Distribution */}
        {eventCounts && (
          <>
            <Divider style={styles.divider} />
            <View style={styles.section}>
              <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Event Distribution
              </Text>
              <View style={styles.eventChips}>
                {(Object.entries(eventCounts) as [EventType, number][])
                  .filter(([_, count]) => count > 0)
                  .map(([eventType, count]) => (
                    <Chip
                      key={eventType}
                      mode="outlined"
                      compact
                      style={[
                        styles.eventChip,
                        { backgroundColor: getEventColor(eventType, theme) + '20' },
                      ]}
                      textStyle={{ color: getEventColor(eventType, theme), fontSize: 11 }}
                    >
                      {`${getEventLabel(eventType)}: ${count}`}
                    </Chip>
                  ))}
              </View>
            </View>
          </>
        )}

        {/* Phase 5: Multi-Signal Sentiment */}
        {(item.avgAspectScore !== null && item.avgAspectScore !== undefined) ||
        (item.avgFinBERTScore !== null && item.avgFinBERTScore !== undefined) ? (
          <>
            <Divider style={styles.divider} />
            <View style={styles.section}>
              <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Multi-Signal Sentiment
              </Text>
              <View style={styles.signalRow}>
                {/* Aspect Score */}
                {item.avgAspectScore !== null && item.avgAspectScore !== undefined && (
                  <View style={styles.signal}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Aspect Score
                    </Text>
                    <Text
                      variant="titleMedium"
                      style={{
                        color: getScoreColor(item.avgAspectScore, theme),
                        fontWeight: 'bold',
                      }}
                    >
                      {`${item.avgAspectScore >= 0 ? '+' : ''}${item.avgAspectScore.toFixed(2)}`}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {getScoreLabel(item.avgAspectScore)}
                    </Text>
                  </View>
                )}

                {/* DistilFinBERT Score */}
                {item.avgFinBERTScore !== null && item.avgFinBERTScore !== undefined && (
                  <View style={styles.signal}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      FinBERT Score
                    </Text>
                    <Text
                      variant="titleMedium"
                      style={{
                        color: getScoreColor(item.avgFinBERTScore, theme),
                        fontWeight: 'bold',
                      }}
                    >
                      {`${item.avgFinBERTScore >= 0 ? '+' : ''}${item.avgFinBERTScore.toFixed(2)}`}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {getScoreLabel(item.avgFinBERTScore)}
                    </Text>
                  </View>
                )}

                {/* Material Event Count */}
                {item.materialEventCount !== undefined && item.materialEventCount > 0 && (
                  <View style={styles.signal}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Material Events
                    </Text>
                    <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                      {item.materialEventCount}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {item.materialEventCount === 1 ? 'article' : 'articles'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </>
        ) : null}

        {/* Legacy Word Counts (Collapsible) */}
        <Divider style={styles.divider} />
        <TouchableOpacity onPress={() => setShowLegacyMetrics(!showLegacyMetrics)}>
          <View style={styles.section}>
            <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
              {`Legacy Metrics ${showLegacyMetrics ? '▼' : '▶'}`}
            </Text>
          </View>
        </TouchableOpacity>

        {showLegacyMetrics && (
          <View style={[styles.wordCounts, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.wordCount}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Positive Words
              </Text>
              <Text variant="titleLarge" style={{ color: theme.colors.positive }}>
                {item.positive}
              </Text>
            </View>

            <View style={styles.wordCount}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Negative Words
              </Text>
              <Text variant="titleLarge" style={{ color: theme.colors.negative }}>
                {item.negative}
              </Text>
            </View>

            <View style={styles.wordCount}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Sentiment Score
              </Text>
              <Text variant="titleLarge" style={{ color: sentimentColor }}>
                {item.sentimentNumber.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Predictions */}
        <Divider style={styles.divider} />
        <View style={styles.section}>
          <Text variant="labelMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Predictions
          </Text>
          <View style={styles.predictionRow}>
            <View style={styles.prediction}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                1-Day
              </Text>
              {renderPrediction(item.nextDayDirection, item.nextDayProbability, item.nextDay)}
            </View>

            <View style={styles.prediction}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                2-Weeks
              </Text>
              {renderPrediction(item.twoWeekDirection, item.twoWeekProbability, item.twoWks)}
            </View>

            <View style={styles.prediction}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                1-Month
              </Text>
              {renderPrediction(item.oneMonthDirection, item.oneMonthProbability, item.oneMnth)}
            </View>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
});

CombinedWordItem.displayName = 'CombinedWordItem';

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  date: {
    fontWeight: 'bold',
  },
  sentimentChip: {
    height: 28,
  },
  sentimentText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  eventChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventChip: {
    marginRight: 4,
    marginBottom: 4,
  },
  signalRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  signal: {
    alignItems: 'center',
    flex: 1,
  },
  wordCounts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  wordCount: {
    alignItems: 'center',
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  prediction: {
    alignItems: 'center',
  },
});
