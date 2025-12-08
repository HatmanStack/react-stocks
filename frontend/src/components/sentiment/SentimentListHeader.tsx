/**
 * Sentiment List Header
 * Fixed header row showing column labels for sentiment data
 * Matches PriceListHeader styling
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme, MD3Theme } from 'react-native-paper';

export const SentimentListHeader: React.FC = () => {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.elevation.level2 }]}>
      <View style={styles.row}>
        <View style={styles.dateColumn}>
          <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
            Date
          </Text>
        </View>

        <View style={styles.valueColumn}>
          <Text variant="labelSmall" style={[styles.headerText, { color: theme.colors.onSurface }]}>
            Sent
          </Text>
        </View>

        <View style={styles.valueColumn}>
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
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.outlineVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateColumn: {
    flex: 1.5,
    minWidth: 55,
  },
  valueColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 50,
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
});
