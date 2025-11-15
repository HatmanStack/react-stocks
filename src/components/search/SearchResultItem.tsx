/**
 * Search Result Item Component
 * Displays a single search result with ticker, company name, and exchange
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { SymbolDetails } from '@/types/database.types';

interface SearchResultItemProps {
  symbol: SymbolDetails;
  onPress: () => void;
  disabled?: boolean;
  subtitle?: string;
}

export function SearchResultItem({ symbol, onPress, disabled = false, subtitle }: SearchResultItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
      accessibilityLabel={`${symbol.ticker}, ${symbol.name}`}
      accessibilityHint="Double tap to view stock details"
      accessibilityRole="button"
    >
      <Card style={[styles.card, disabled && styles.disabledCard]}>
        <Card.Content>
          <View style={styles.container}>
            <View style={styles.leftContent}>
              <Text style={[styles.ticker, disabled && styles.disabledText]} allowFontScaling={true}>
                {symbol.ticker}
              </Text>
              <Text style={[styles.name, disabled && styles.disabledText]} numberOfLines={1} allowFontScaling={true}>
                {symbol.name}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} allowFontScaling={true}>
                  {subtitle}
                </Text>
              ) : symbol.exchangeCode ? (
                <Text style={styles.exchange} allowFontScaling={true}>
                  {symbol.exchangeCode}
                </Text>
              ) : null}
            </View>
            <Ionicons
              name={disabled ? "checkmark-circle" : "chevron-forward"}
              size={24}
              color={disabled ? "#4CAF50" : "#9E9E9E"}
              accessible={false}
            />
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 4,
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftContent: {
    flex: 1,
  },
  ticker: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    color: '#212121',
    marginBottom: 2,
  },
  exchange: {
    fontSize: 12,
    color: '#757575',
  },
  subtitle: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  disabledCard: {
    opacity: 0.6,
  },
  disabledText: {
    color: '#9E9E9E',
  },
});
