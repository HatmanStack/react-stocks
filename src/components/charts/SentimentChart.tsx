import React, { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from 'react-native-paper';
import { LineChart, Grid, XAxis, YAxis } from 'react-native-svg-charts';
import { Rect, Text } from 'react-native-svg';
import * as shape from 'd3-shape';
import { format, parseISO } from 'date-fns';
import { transformSentimentData } from '@/hooks/useChartData';
import type { CombinedWordDetails } from '@/types/database.types';

interface SentimentChartProps {
  data: Array<{ date: string; sentimentScore: number }> | CombinedWordDetails[];
  width?: number;
  height?: number;
}

export function SentimentChart({ data, width: customWidth, height = 220 }: SentimentChartProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const width = customWidth || screenWidth - 32;

  // Transform data if needed
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Check if data is CombinedWordDetails format
    const isCombinedWordDetails = 'sentimentNumber' in data[0];

    if (isCombinedWordDetails) {
      const transformed = transformSentimentData(data as CombinedWordDetails[]);
      return transformed.map(point => point.y);
    }

    // Already in simple format
    return (data as Array<{ date: string; sentimentScore: number }>).map(d => d.sentimentScore);
  }, [data]);

  const dates = useMemo(() => {
    if (data.length === 0) return [];

    const isCombinedWordDetails = 'sentimentNumber' in data[0];
    if (isCombinedWordDetails) {
      return (data as CombinedWordDetails[])
        .map(d => d.date)
        .sort();
    }

    return (data as Array<{ date: string; sentimentScore: number }>)
      .map(d => d.date)
      .sort();
  }, [data]);

  // Format X-axis labels
  const formatXAxis = (value: number, index: number) => {
    if (dates.length === 0) return '';
    const dateStr = dates[index];
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'MMM dd');
    } catch {
      return '';
    }
  };

  // Format Y-axis labels
  const formatYAxis = (value: number) => {
    if (value === 1) return 'Positive';
    if (value === 0) return 'Neutral';
    if (value === -1) return 'Negative';
    return value.toFixed(1);
  };

  // Background zones component
  const BackgroundZones = ({ x, y }: any) => {
    // Safety check for test environment
    if (typeof x !== 'function' || typeof y !== 'function') {
      return null;
    }

    const chartHeight = height - 40;
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
          opacity={0.1}
        />

        {/* Neutral zone (-0.2 to 0.2) - gray */}
        <Rect
          x={x(0)}
          y={y(0.2)}
          width={chartWidth}
          height={y(-0.2) - y(0.2)}
          fill={theme.colors.surfaceVariant}
          opacity={0.15}
        />

        {/* Negative zone (-1.0 to -0.2) - red */}
        <Rect
          x={x(0)}
          y={y(-0.2)}
          width={chartWidth}
          height={y(-1.0) - y(-0.2)}
          fill={theme.colors.negative}
          opacity={0.1}
        />
      </>
    );
  };

  if (chartData.length === 0) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Text
          fill={theme.colors.onSurfaceVariant}
          fontSize={14}
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
        >
          No sentiment data available
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width, height: height + 60 }}>
      <View style={{ height, flexDirection: 'row' }}>
        {/* Y-Axis */}
        <YAxis
          data={chartData}
          contentInset={{ top: 20, bottom: 20 }}
          svg={{
            fill: theme.colors.onSurfaceVariant,
            fontSize: 10,
          }}
          min={-1}
          max={1}
          numberOfTicks={7}
          formatLabel={formatYAxis}
          style={{ width: 50 }}
        />

        {/* Chart */}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <LineChart
            style={{ flex: 1 }}
            data={chartData}
            contentInset={{ top: 20, bottom: 20 }}
            curve={shape.curveNatural}
            svg={{
              stroke: theme.colors.primary,
              strokeWidth: 2,
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
          </LineChart>
        </View>
      </View>

      {/* X-Axis */}
      <XAxis
        data={chartData}
        formatLabel={formatXAxis}
        contentInset={{ left: 58, right: 16 }}
        svg={{
          fill: theme.colors.onSurfaceVariant,
          fontSize: 10,
        }}
        numberOfTicks={5}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}
