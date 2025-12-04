/**
 * Time Range Selector
 * Compact button group for selecting price chart time ranges
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y';

interface TimeRangeSelectorProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
}

const RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y'];

export function TimeRangeSelector({ selectedRange, onRangeChange }: TimeRangeSelectorProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {RANGES.map((range) => {
        const isSelected = range === selectedRange;
        return (
          <Pressable
            key={range}
            onPress={() => onRangeChange(range)}
            style={[
              styles.button,
              {
                backgroundColor: isSelected ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                {
                  color: isSelected ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                  fontWeight: isSelected ? '600' : '400',
                },
              ]}
            >
              {range}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Calculate the number of days for a given time range
 */
export function getTimeRangeDays(range: TimeRange): number {
  const now = new Date();

  switch (range) {
    case '1M':
      return 30;
    case '3M':
      return 90;
    case '6M':
      return 180;
    case 'YTD': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    case '1Y':
      return 365;
    case '2Y':
      return 730;
    case '5Y':
      return 1825;
    default:
      return 30;
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  button: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 11,
  },
});
