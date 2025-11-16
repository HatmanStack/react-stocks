import React, { useMemo } from 'react';
import { View, useWindowDimensions, Text as RNText } from 'react-native';
import { useTheme, Text as PaperText } from 'react-native-paper';
import { AreaChart, Grid, XAxis, YAxis } from 'react-native-svg-charts';
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

  // Transform data and extract dates from the same source
  const { chartData, dates } = useMemo(() => {
    if (data.length === 0) return { chartData: [], dates: [] };

    // Check if data is StockDetails format
    const isStockDetails = 'close' in data[0];

    if (isStockDetails) {
      // Transform data and derive both chartData and dates from the same transformed result
      const transformed = transformPriceData(data as StockDetails[]);
      return {
        chartData: transformed.map(point => point.y),
        dates: transformed.map(point => {
          // Extract date from the x value (which is a Date object)
          const dateObj = point.x;
          // Convert to ISO string format (YYYY-MM-DD)
          return dateObj.toISOString().split('T')[0];
        }),
      };
    }

    // Already in simple format
    const simpleData = data as Array<{ date: string; price: number }>;
    return {
      chartData: simpleData.map(d => d.price),
      dates: simpleData.map(d => d.date),
    };
  }, [data]);

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return { isPositive: false, percentage: 0 };

    const firstPrice = chartData[0];
    const lastPrice = chartData[chartData.length - 1];

    // Guard against division by zero (consistent with calculatePriceChange)
    if (firstPrice === 0) {
      return { isPositive: lastPrice > 0, percentage: 0 };
    }

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
        <PaperText
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          No data available
        </PaperText>
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
