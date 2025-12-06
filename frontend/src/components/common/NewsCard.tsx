/**
 * News Card Component
 * Displays a news article with title, publisher, date, and description
 */

import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Card, useTheme } from 'react-native-paper';
import type { NewsDetails } from '@/types/database.types';
import { formatNewsDate } from '@/utils/date/dateUtils';

interface NewsCardProps {
  article: NewsDetails;
}

export function NewsCard({ article }: NewsCardProps) {
  const theme = useTheme();

  const handlePress = () => {
    if (article.articleUrl) {
      Linking.openURL(article.articleUrl).catch((error) => {
        console.error('Error opening URL:', error);
      });
    }
  };

  return (
    <Card style={styles.card} onPress={handlePress}>
      <Card.Content>
        <Text style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={2}>
          {article.title}
        </Text>

        <View style={styles.metaContainer}>
          <Text style={[styles.publisher, { color: theme.colors.primary }]}>
            {article.publisher}
          </Text>
          <Text style={[styles.date, { color: theme.colors.onSurfaceVariant }]}>
            {formatNewsDate(article.date)}
          </Text>
        </View>

        {article.articleDescription && (
          <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]} numberOfLines={3}>
            {article.articleDescription}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
    marginHorizontal: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  publisher: {
    fontSize: 14,
    fontWeight: '500',
  },
  date: {
    fontSize: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
});
