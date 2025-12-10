/**
 * Sentiment List Header
 * Fixed header row showing column labels for sentiment data
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export const SentimentListHeader: React.FC = () => {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {/* Prediction explanation */}
      <View style={[styles.explanationContainer, { backgroundColor: theme.colors.elevation.level1 }]}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Predictions show probability of price movement: 1D (next day), 2W (two weeks), 1M (one month)
        </Text>
      </View>

      {/* Column headers */}
      <View style={[styles.container, { backgroundColor: theme.colors.elevation.level2, borderBottomColor: theme.colors.outlineVariant }]}>
        <View style={styles.row}>
          <View style={styles.dateColumn}>
            <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
              Date
            </Text>
          </View>

          <View style={styles.centerColumn}>
            <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
              Sentiment
            </Text>
          </View>

          <View style={styles.centerColumn}>
            <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
              Aspect
            </Text>
          </View>

          <View style={styles.valueColumn}>
            <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
              1D
            </Text>
          </View>

          <View style={styles.valueColumn}>
            <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
              2W
            </Text>
          </View>

          <View style={styles.valueColumn}>
            <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
              1M
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  explanationContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  container: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
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
  valueColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 45,
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
});
