/**
 * Multi-Signal Sentiment Chart
 *
 * **Phase 5 Update:** Now displays up to three sentiment signals:
 * - Legacy sentiment (blue)
 * - Aspect score (green/red)
 * - DistilFinBERT score (purple)
 */

import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useTheme, Chip, Text as PaperText } from 'react-native-paper';
import { LineChart, Grid, XAxis, YAxis } from 'react-native-svg-charts';
import { Rect, Line } from 'react-native-svg';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as shape from 'd3-shape';
import { format, parseISO } from 'date-fns';
import { transformSentimentData } from '@/hooks/useChartData';
import { useLayoutDensity } from '@/hooks/useLayoutDensity';
import type { CombinedWordDetails } from '@/types/database.types';

interface SentimentChartProps {
  data: { date: string; sentimentScore: number }[] | CombinedWordDetails[];
  width?: number;
  height?: number;
}

interface ChartSeries {
  data: number[];
  color: string;
  label: string;
  visible: boolean;
}

const SentimentChartComponent = ({ data, width: customWidth, height = 220 }: SentimentChartProps) => {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { fontSize } = useLayoutDensity();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Use measured container width, fallback to screen width calculation
  const width = customWidth || containerWidth || screenWidth - 32;
  // Use subtitle size for axis labels, respects user's fontScale
  const axisLabelSize = fontSize.subtitle;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth } = event.nativeEvent.layout;
    if (layoutWidth > 0 && layoutWidth !== containerWidth) {
      setContainerWidth(layoutWidth);
    }
  };

  // Track which series are visible
  const [visibleSeries, setVisibleSeries] = useState({
    legacy: true,
    aspect: true,
    finbert: true,
  });

  // Extract dates
  const dates = useMemo(() => {
    if (data.length === 0) return [];

    const isCombinedWordDetails = 'sentimentNumber' in data[0];
    if (isCombinedWordDetails) {
      return (data as CombinedWordDetails[])
        .map(d => d.date)
        .sort();
    }

    return (data as { date: string; sentimentScore: number }[])
      .map(d => d.date)
      .sort();
  }, [data]);

  // Prepare multi-series data
  const chartSeries = useMemo(() => {
    if (data.length === 0) return { series: [], hasAspect: false, hasFinBERT: false };

    const isCombinedWordDetails = 'sentimentNumber' in data[0];

    if (!isCombinedWordDetails) {
      // Simple format - only legacy sentiment
      const legacyData = (data as { date: string; sentimentScore: number }[]).map(d => d.sentimentScore);
      return {
        series: [
          {
            data: legacyData,
            color: theme.colors.primary,
            label: 'Sentiment',
            visible: visibleSeries.legacy,
          },
        ],
        hasAspect: false,
        hasFinBERT: false,
      };
    }

    // CombinedWordDetails format - extract all signals
    const combinedData = data as CombinedWordDetails[];
    const transformed = transformSentimentData(combinedData);

    // Extract aspect scores (if available)
    const aspectData = combinedData.map(d =>
      d.avgAspectScore !== null && d.avgAspectScore !== undefined
        ? d.avgAspectScore
        : null
    );
    const hasAspect = aspectData.some(v => v !== null);

    // Extract FinBERT scores (if available)
    const finbertData = combinedData.map(d =>
      d.avgFinBERTScore !== null && d.avgFinBERTScore !== undefined
        ? d.avgFinBERTScore
        : null
    );
    const hasFinBERT = finbertData.some(v => v !== null);

    const series: ChartSeries[] = [
      {
        data: transformed.map(point => point.y),
        color: theme.colors.primary,
        label: 'Legacy',
        visible: visibleSeries.legacy,
      },
    ];

    if (hasAspect) {
      series.push({
        data: aspectData.map(v => v ?? NaN), // Use NaN for missing data points
        color: '#4CAF50', // Green
        label: 'Aspect',
        visible: visibleSeries.aspect,
      });
    }

    if (hasFinBERT) {
      series.push({
        data: finbertData.map(v => v ?? NaN), // Use NaN for missing data points
        color: '#9C27B0', // Purple
        label: 'FinBERT',
        visible: visibleSeries.finbert,
      });
    }

    return { series, hasAspect, hasFinBERT };
  }, [data, theme, visibleSeries]);

  // Toggle series visibility
  const toggleSeries = (seriesName: 'legacy' | 'aspect' | 'finbert') => {
    setVisibleSeries(prev => ({
      ...prev,
      [seriesName]: !prev[seriesName],
    }));
  };

  // Format X-axis labels
  // In react-native-svg-charts, formatLabel receives (value, index) where:
  // - value: the data array index for this tick position
  // - index: the tick number (0, 1, 2, ...)
  const formatXAxis = (value: number, _index: number) => {
    const dataIndex = Math.round(value);
    if (dates.length === 0 || dataIndex >= dates.length || dataIndex < 0) return '';
    const dateStr = dates[dataIndex];
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'MMM dd');
    } catch {
      return '';
    }
  };

  // Format Y-axis labels
  const formatYAxis = (value: number) => {
    if (value === 1) return '+1.0';
    if (value === 0) return '0.0';
    if (value === -1) return '-1.0';
    return value.toFixed(1);
  };

  // Background zones component
  const BackgroundZones = ({ x, y }: any) => {
    // Safety check for test environment
    if (typeof x !== 'function' || typeof y !== 'function') {
      return null;
    }

    const chartWidth = width - 66;

    return (
      <>
        {/* Positive zone (0.2 to 1.0) - green */}
        <Rect
          x={x(0)}
          y={y(1.0)}
          width={chartWidth}
          height={y(0.2) - y(1.0)}
          fill={theme.colors.positive}
          opacity={0.08}
        />

        {/* Neutral zone (-0.2 to 0.2) - gray */}
        <Rect
          x={x(0)}
          y={y(0.2)}
          width={chartWidth}
          height={y(-0.2) - y(0.2)}
          fill={theme.colors.surfaceVariant}
          opacity={0.1}
        />

        {/* Negative zone (-1.0 to -0.2) - red */}
        <Rect
          x={x(0)}
          y={y(-0.2)}
          width={chartWidth}
          height={y(-1.0) - y(-0.2)}
          fill={theme.colors.negative}
          opacity={0.08}
        />

        {/* Zero line */}
        <Line
          x1={x(0)}
          y1={y(0)}
          x2={x(chartSeries.series[0]?.data.length - 1 || 0)}
          y2={y(0)}
          stroke={theme.colors.outline}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />
      </>
    );
  };

  if (chartSeries.series.length === 0 || chartSeries.series[0].data.length === 0) {
    return (
      <View
        style={{ flex: 1, minHeight: height, justifyContent: 'center', alignItems: 'center' }}
        onLayout={handleLayout}
      >
        <PaperText
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          No sentiment data available
        </PaperText>
      </View>
    );
  }

  // Don't render chart until we have a valid width measurement
  if (!containerWidth && !customWidth) {
    return (
      <View
        style={{ flex: 1, minHeight: height + 90 }}
        onLayout={handleLayout}
      />
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      style={{ flex: 1, minHeight: height + 90 }}
      onLayout={handleLayout}
    >
      {/* Legend with toggle chips */}
      {(chartSeries.hasAspect || chartSeries.hasFinBERT) && (
        <View style={styles.legend}>
          <Chip
            mode={visibleSeries.legacy ? 'flat' : 'outlined'}
            selected={visibleSeries.legacy}
            onPress={() => toggleSeries('legacy')}
            style={[styles.legendChip, { borderColor: theme.colors.primary }]}
            textStyle={{ fontSize: 11 }}
          >
            Legacy
          </Chip>
          {chartSeries.hasAspect && (
            <Chip
              mode={visibleSeries.aspect ? 'flat' : 'outlined'}
              selected={visibleSeries.aspect}
              onPress={() => toggleSeries('aspect')}
              style={[styles.legendChip, { borderColor: '#4CAF50' }]}
              textStyle={{ fontSize: 11 }}
            >
              Aspect
            </Chip>
          )}
          {chartSeries.hasFinBERT && (
            <Chip
              mode={visibleSeries.finbert ? 'flat' : 'outlined'}
              selected={visibleSeries.finbert}
              onPress={() => toggleSeries('finbert')}
              style={[styles.legendChip, { borderColor: '#9C27B0' }]}
              textStyle={{ fontSize: 11 }}
            >
              FinBERT
            </Chip>
          )}
        </View>
      )}

      <View style={{ height, flexDirection: 'row' }}>
        {/* Y-Axis */}
        <YAxis
          data={chartSeries.series[0].data}
          contentInset={{ top: 20, bottom: 20 }}
          svg={{
            fill: theme.colors.onSurfaceVariant,
            fontSize: axisLabelSize,
          }}
          min={-1}
          max={1}
          numberOfTicks={5}
          formatLabel={formatYAxis}
          style={{ width: 65 }}
        />

        {/* Chart */}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <LineChart
            style={{ flex: 1 }}
            data={chartSeries.series[0].data}
            contentInset={{ top: 20, bottom: 20 }}
            curve={shape.curveNatural}
            svg={{
              stroke: chartSeries.series[0].color,
              strokeWidth: 2,
              strokeOpacity: chartSeries.series[0].visible ? 1 : 0,
            }}
            yMin={-1}
            yMax={1}
          >
            <Grid
              svg={{
                stroke: theme.colors.surfaceVariant,
                strokeOpacity: 0.3,
              }}
            />
            <BackgroundZones />

            {/* Additional series (Aspect and FinBERT) */}
            {chartSeries.series.slice(1).map((series, index) =>
              series.visible ? (
                <LineChart
                  key={`series-${index}`}
                  style={StyleSheet.absoluteFill}
                  data={series.data}
                  contentInset={{ top: 20, bottom: 20 }}
                  curve={shape.curveNatural}
                  svg={{
                    stroke: series.color,
                    strokeWidth: 2,
                    strokeDasharray: '4 4', // Dashed line for additional series
                  }}
                  yMin={-1}
                  yMax={1}
                />
              ) : null
            )}
          </LineChart>
        </View>
      </View>

      {/* X-Axis */}
      <XAxis
        data={chartSeries.series[0].data}
        formatLabel={formatXAxis}
        contentInset={{ left: 73, right: 16 }}
        svg={{
          fill: theme.colors.onSurfaceVariant,
          fontSize: axisLabelSize,
        }}
        numberOfTicks={5}
        style={{ marginTop: 8 }}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  legendChip: {
    height: 28,
  },
});

// Memoize component to prevent unnecessary re-renders
export const SentimentChart = React.memo(SentimentChartComponent);
