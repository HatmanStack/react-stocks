import React, { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AreaChart, Grid, XAxis, YAxis } from 'react-native-svg-charts';
import { Text } from 'react-native-svg';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as shape from 'd3-shape';
import { format, parseISO } from 'date-fns';
import { transformPriceData, calculatePriceChange } from '@/hooks/useChartData';
import type { StockDetails } from '@/types/database.types';

interface PriceChartProps {
  data: Array<{ date: string; price: number }> | StockDetails[];
  width?: number;
  height?: number;
}

const PriceChartComponent = ({ data, width: customWidth, height = 220 }: PriceChartProps) => {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const width = customWidth || screenWidth - 32;

  // Transform data if needed
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Check if data is StockDetails format
    const isStockDetails = 'close' in data[0];

    if (isStockDetails) {
      const transformed = transformPriceData(data as StockDetails[]);
      return transformed.map(point => point.y);
    }

    // Already in simple format
    return (data as Array<{ date: string; price: number }>).map(d => d.price);
  }, [data]);

  const dates = useMemo(() => {
    if (data.length === 0) return [];

    const isStockDetails = 'close' in data[0];
    if (isStockDetails) {
      return (data as StockDetails[])
        .map(d => d.date)
        .sort();
    }

    return (data as Array<{ date: string; price: number }>)
      .map(d => d.date)
      .sort();
  }, [data]);

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return { isPositive: false, percentage: 0 };

    const firstPrice = chartData[0];
    const lastPrice = chartData[chartData.length - 1];
    const percentage = ((lastPrice - firstPrice) / firstPrice) * 100;

    return { isPositive: percentage > 0, percentage };
  }, [chartData]);

  const chartColor = priceChange.isPositive ? theme.colors.positive : theme.colors.negative;

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
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
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
          No data available
        </Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(300)} style={{ width, height: height + 60 }}>
      <View style={{ height, flexDirection: 'row' }}>
        {/* Y-Axis */}
        <YAxis
          data={chartData}
          contentInset={{ top: 20, bottom: 20 }}
          svg={{
            fill: theme.colors.onSurfaceVariant,
            fontSize: 10,
          }}
          numberOfTicks={5}
          formatLabel={formatYAxis}
          style={{ width: 50 }}
        />

        {/* Chart */}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <AreaChart
            style={{ flex: 1 }}
            data={chartData}
            contentInset={{ top: 20, bottom: 20 }}
            curve={shape.curveNatural}
            svg={{
              fill: chartColor,
              fillOpacity: 0.2,
              stroke: chartColor,
              strokeWidth: 2,
            }}
          >
            <Grid
              svg={{
                stroke: theme.colors.surfaceVariant,
                strokeOpacity: 0.3,
              }}
            />
          </AreaChart>
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
    </Animated.View>
  );
};

// Memoize component to prevent unnecessary re-renders
export const PriceChart = React.memo(PriceChartComponent);
