/**
 * Sentiment Loading State Component
 * Displays loading spinner and progress while sentiment analysis is processing
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text, ProgressBar } from 'react-native-paper';
import type { SentimentJobStatus } from '@/services/api/lambdaSentiment.service';

export interface SentimentLoadingStateProps {
  /**
   * Current job status from Lambda
   */
  jobStatus?: SentimentJobStatus | null;

  /**
   * Optional progress percentage (0-100)
   */
  progress?: number;

  /**
   * Optional custom message
   */
  message?: string;
}

/**
 * Loading state component for sentiment analysis
 * Shows spinner, status message, and optional progress indicator
 */
export function SentimentLoadingState({
  jobStatus,
  progress,
  message,
}: SentimentLoadingStateProps) {
  // Determine status message
  const getStatusMessage = (): string => {
    if (message) return message;

    if (jobStatus) {
      switch (jobStatus.status) {
        case 'PENDING':
          return 'Queued for analysis...';
        case 'IN_PROGRESS':
          return jobStatus.articlesProcessed
            ? `Processing ${jobStatus.articlesProcessed} articles...`
            : 'Processing sentiment analysis...';
        case 'COMPLETED':
          return 'Analysis complete!';
        case 'FAILED':
          return 'Analysis failed';
        default:
          return 'Analyzing sentiment...';
      }
    }

    return 'Analyzing sentiment...';
  };

  // Calculate progress percentage
  const getProgress = (): number => {
    if (progress !== undefined) {
      return progress / 100;
    }

    // If no explicit progress, show indeterminate
    return 0;
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="large"
        color="#007AFF"
        style={styles.spinner}
        testID="sentiment-loading-spinner"
      />

      <Text style={styles.title} variant="titleMedium">
        Analyzing Sentiment
      </Text>

      <Text style={styles.subtitle} variant="bodyMedium">
        {getStatusMessage()}
      </Text>

      {jobStatus?.status === 'IN_PROGRESS' && progress !== undefined && (
        <ProgressBar
          progress={getProgress()}
          color="#007AFF"
          style={styles.progressBar}
          testID="sentiment-progress-bar"
        />
      )}

      {jobStatus?.jobId && (
        <Text style={styles.jobId} variant="bodySmall">
          Job ID: {jobStatus.jobId}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  spinner: {
    marginBottom: 24,
  },
  title: {
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
    color: '#000',
  },
  subtitle: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    maxWidth: 300,
    marginTop: 16,
    height: 8,
    borderRadius: 4,
  },
  jobId: {
    color: '#999',
    marginTop: 16,
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
