import React, { useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Text as PaperText } from 'react-native-paper';
import { AreaChart, Grid, XAxis, YAxis } from 'react-native-svg-charts';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as shape from 'd3-shape';
import { format, parseISO } from 'date-fns';
import { transformPriceData } from '@/hooks/useChartData';
import { useLayoutDensity } from '@/hooks/useLayoutDensity';
import type { StockDetails } from '@/types/database.types';

interface PriceChartProps {
  data: { date: string; price: number }[] | StockDetails[];
  width?: number;
  height?: number;
}

const PriceChartComponent = ({ data, width: customWidth, height = 220 }: PriceChartProps) => {
  const theme = useAppTheme();
  const { fontSize } = useLayoutDensity();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Use subtitle size for axis labels, respects user's fontScale
  const axisLabelSize = fontSize.subtitle;

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
    const simpleData = data as { date: string; price: number }[];
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
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth } = event.nativeEvent.layout;
    if (layoutWidth > 0 && layoutWidth !== containerWidth) {
      setContainerWidth(layoutWidth);
    }
  };

  if (chartData.length === 0) {
    return (
      <View
        style={{ flex: 1, minHeight: height, justifyContent: 'center', alignItems: 'center' }}
        onLayout={handleLayout}
      >
        <PaperText
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          No data available
        </PaperText>
      </View>
    );
  }

  // Don't render chart until we have a valid width measurement
  if (!containerWidth && !customWidth) {
    return (
      <View
        style={{ flex: 1, minHeight: height + 60 }}
        onLayout={handleLayout}
      />
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      style={{ flex: 1, minHeight: height + 60 }}
      onLayout={handleLayout}
    >
      <View style={{ height, flexDirection: 'row' }}>
        {/* Y-Axis */}
        <YAxis
          data={chartData}
          contentInset={{ top: 20, bottom: 20 }}
          svg={{
            fill: theme.colors.onSurfaceVariant,
            fontSize: axisLabelSize,
          }}
          numberOfTicks={5}
          formatLabel={formatYAxis}
          style={{ width: 65 }}
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

// Memoize component to prevent unnecessary re-renders
export const PriceChart = React.memo(PriceChartComponent);
