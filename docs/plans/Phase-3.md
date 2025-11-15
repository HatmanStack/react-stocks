# Phase 3: Stock Detail Screen & Data Visualization

## Phase Goal

Implement professional data visualization using Victory Native charts for price and sentiment data. Transform the stock detail screen into a spacious, data-focused interface with area charts for prices, trend lines with color zones for sentiment, and mini sparklines for portfolio items.

**Success Criteria:**
- Area chart with gradient displaying stock prices
- Sentiment visualization with color-coded background zones
- Mini sparkline charts in portfolio items
- Stock detail screen uses spacious layout (contrast to dense lists)
- Charts use theme colors and are responsive
- Smooth chart animations when data loads
- All charts work on web (primary target)

**Estimated Tokens:** ~102,000

---

## Prerequisites

- Phases 0, 1, and 2 complete
- Victory Native and react-native-svg installed (Phase 1 Task 1)
- Dark theme active
- MonoText and formatting utilities available
- List views modernized

---

## Tasks

### Task 1: Create Chart Data Transformation Hook

**Goal:** Build utility hook to transform stock/sentiment data into Victory Native chart format

**Files to Modify/Create:**
- `src/hooks/useChartData.ts` - NEW hook
- `src/hooks/index.ts` - Add export

**Prerequisites:**
- Understand Victory Native data format requirements
- Know existing data structures (StockDetails, SentimentDetails)

**Implementation Steps:**
1. Create `useChartData.ts` hook file
2. Implement function to transform stock price data to Victory format
3. Implement function to transform sentiment data to Victory format
4. Handle edge cases (missing data, null values, date parsing)
5. Memoize transformations to prevent unnecessary recalculations
6. Add TypeScript types for input and output data
7. Export from hooks/index.ts

**Victory Native Data Format:**
```typescript
// Victory expects: Array<{ x: Date | number, y: number }>
type ChartDataPoint = { x: Date; y: number };
```

**Functions to Implement:**
```typescript
function transformPriceData(stocks: StockDetails[]): ChartDataPoint[]
function transformSentimentData(sentiment: SentimentDetails[]): ChartDataPoint[]
function calculatePriceChange(data: ChartDataPoint[]): { isPositive: boolean; percentage: number }
```

**Implementation Guidance:**
- Filter out null/undefined prices
- Sort by date ascending (Victory requires sorted data)
- Parse ISO date strings to Date objects
- For price data, use `close` or `currentPrice` field
- For sentiment, use `sentimentScore` or `sentimentNumber` field
- Calculate overall trend (positive if last > first)

**Verification Checklist:**
- [ ] Transforms stock data correctly
- [ ] Transforms sentiment data correctly
- [ ] Handles missing/null data gracefully
- [ ] Dates sorted ascending
- [ ] Returns memoized result
- [ ] TypeScript types defined
- [ ] Exported from hooks/index.ts

**Testing Instructions:**
```typescript
// src/hooks/__tests__/useChartData.test.ts
import { renderHook } from '@testing-library/react-hooks';
import { useChartData } from '../useChartData';

const mockStockData = [
  { date: '2025-11-01', close: 100 },
  { date: '2025-11-02', close: 105 },
  { date: '2025-11-03', close: 103 },
];

describe('useChartData', () => {
  it('transforms stock data to Victory format', () => {
    const { result } = renderHook(() =>
      useChartData.transformPriceData(mockStockData)
    );

    expect(result.current).toHaveLength(3);
    expect(result.current[0]).toHaveProperty('x');
    expect(result.current[0]).toHaveProperty('y');
    expect(result.current[0].x).toBeInstanceOf(Date);
  });

  it('calculates positive price change', () => {
    const chartData = [
      { x: new Date('2025-11-01'), y: 100 },
      { x: new Date('2025-11-03'), y: 105 },
    ];
    const change = useChartData.calculatePriceChange(chartData);

    expect(change.isPositive).toBe(true);
    expect(change.percentage).toBeCloseTo(5.0);
  });

  it('handles empty data gracefully', () => {
    const { result } = renderHook(() =>
      useChartData.transformPriceData([])
    );

    expect(result.current).toEqual([]);
  });
});
```

**Commit Message Template:**
```
feat(hooks): add useChartData for Victory Native transformation

- Create transformPriceData function
- Create transformSentimentData function
- Add calculatePriceChange utility
- Handle edge cases (null, empty data)
- Memoize transformations for performance
```

**Estimated Tokens:** ~12,000

---

### Task 2: Create Base PriceChart Component

**Goal:** Build area chart component for displaying stock prices with gradient fill

**Files to Modify/Create:**
- `src/components/charts/PriceChart.tsx` - NEW component
- `src/components/charts/index.ts` - NEW index export

**Prerequisites:**
- Task 1 complete (useChartData available)
- Understand ADR-004 (Chart Library) from Phase 0
- Understand Pattern 5 (Chart Component Structure) from Phase 0

**Implementation Steps:**
1. Create `src/components/charts/` directory
2. Create `PriceChart.tsx` component
3. Import Victory Native components: VictoryChart, VictoryArea, VictoryAxis, VictoryTheme
4. Accept props: `data`, `width`, `height`
5. Use useTheme() for colors
6. Determine if price trend is positive or negative
7. Apply green gradient for positive, red for negative
8. Configure X-axis (dates) and Y-axis (prices)
9. Add smooth curve interpolation
10. Create index.ts to export chart components

**Component Interface:**
```typescript
interface PriceChartProps {
  data: Array<{ date: string; price: number }>;
  width?: number;
  height?: number;
}
```

**Implementation Guidance:**
- Use `useWindowDimensions` to set responsive width
- Default height: 200-250px
- Gradient: `fill` color at 20% opacity, `stroke` at 100%
- Interpolation: "natural" for smooth curves
- Axis styling: use theme.colors.onSurfaceVariant for labels
- Grid lines: subtle, theme.colors.surfaceVariant
- Hide domain line (cleaner look)
- Label format: dates (MMM DD), prices ($XX.XX)

**Chart Configuration:**
```typescript
<VictoryChart
  width={width}
  height={height}
  padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
  theme={VictoryTheme.material}
>
  <VictoryAxis
    style={{
      axis: { stroke: 'transparent' },
      tickLabels: { fill: theme.colors.onSurfaceVariant, fontSize: 10 },
      grid: { stroke: theme.colors.surfaceVariant, strokeOpacity: 0.3 }
    }}
    tickFormat={(date) => format(date, 'MMM dd')}
  />
  <VictoryAxis
    dependentAxis
    style={{
      axis: { stroke: 'transparent' },
      tickLabels: { fill: theme.colors.onSurfaceVariant, fontSize: 10 },
      grid: { stroke: theme.colors.surfaceVariant, strokeOpacity: 0.3 }
    }}
    tickFormat={(price) => `$${price.toFixed(0)}`}
  />
  <VictoryArea
    data={transformedData}
    interpolation="natural"
    style={{
      data: {
        fill: isPositive ? theme.colors.positive : theme.colors.negative,
        fillOpacity: 0.2,
        stroke: isPositive ? theme.colors.positive : theme.colors.negative,
        strokeWidth: 2,
      }
    }}
  />
</VictoryChart>
```

**Verification Checklist:**
- [ ] Chart renders with price data
- [ ] Area filled with gradient (green or red)
- [ ] Smooth curve interpolation
- [ ] X-axis shows dates
- [ ] Y-axis shows prices with $
- [ ] Uses theme colors
- [ ] Responsive to width changes
- [ ] Works on web

**Testing Instructions:**
```typescript
// src/components/charts/__tests__/PriceChart.test.tsx
import { render } from '@testing-library/react-native';
import { PriceChart } from '../PriceChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme';

const mockData = [
  { date: '2025-11-01', price: 100 },
  { date: '2025-11-02', price: 105 },
  { date: '2025-11-03', price: 103 },
];

describe('PriceChart', () => {
  it('renders without crashing', () => {
    const { UNSAFE_getByType } = render(
      <PriceChart data={mockData} />,
      { wrapper: ({ children }) => <PaperProvider theme={theme}>{children}</PaperProvider> }
    );

    expect(UNSAFE_getByType('VictoryChart')).toBeTruthy();
  });

  it('uses green gradient for positive trend', () => {
    const positiveData = [
      { date: '2025-11-01', price: 100 },
      { date: '2025-11-03', price: 110 },
    ];

    const { UNSAFE_getByType } = render(
      <PriceChart data={positiveData} />,
      { wrapper: ({ children }) => <PaperProvider theme={theme}>{children}</PaperProvider> }
    );

    const area = UNSAFE_getByType('VictoryArea');
    expect(area.props.style.data.fill).toBe(theme.colors.positive);
  });
});
```

**Commit Message Template:**
```
feat(charts): add PriceChart component with Victory Native

- Create area chart with gradient fill
- Support positive (green) and negative (red) trends
- Add responsive sizing with useWindowDimensions
- Style axes with theme colors
- Use smooth curve interpolation
```

**Estimated Tokens:** ~18,000

---

### Task 3: Create Sentiment Chart Component

**Goal:** Build sentiment trend visualization with color-coded background zones

**Files to Modify/Create:**
- `src/components/charts/SentimentChart.tsx` - NEW component
- `src/components/charts/index.ts` - Add export

**Prerequisites:**
- Task 2 complete (understand Victory Native patterns)
- Understand sentiment data structure

**Implementation Steps:**
1. Create `SentimentChart.tsx` component
2. Use VictoryChart, VictoryLine, VictoryArea for zones
3. Accept props: `data`, `width`, `height`
4. Transform sentiment scores to chart data
5. Create three background zones: positive (green), neutral (gray), negative (red)
6. Overlay sentiment trend line
7. Use theme colors for zones and line
8. Configure axes for dates and sentiment scores

**Component Interface:**
```typescript
interface SentimentChartProps {
  data: Array<{ date: string; sentimentScore: number }>;
  width?: number;
  height?: number;
}
```

**Implementation Guidance:**
- Sentiment scale: -1 (very negative) to +1 (very positive)
- Background zones (using VictoryArea):
  - Positive zone: 0.2 to 1.0 (light green, 10% opacity)
  - Neutral zone: -0.2 to 0.2 (gray, 5% opacity)
  - Negative zone: -1.0 to -0.2 (light red, 10% opacity)
- Trend line (using VictoryLine):
  - Color: theme.colors.primary (blue)
  - Stroke width: 2px
  - Interpolation: "natural"
- Y-axis: -1 to 1 with labels (Negative, Neutral, Positive)
- X-axis: dates

**Zone Implementation:**
```typescript
// Create three background areas
<VictoryArea
  data={[
    { x: startDate, y: 0.2, y0: 1.0 },
    { x: endDate, y: 0.2, y0: 1.0 },
  ]}
  style={{
    data: {
      fill: theme.colors.positive,
      fillOpacity: 0.1,
      stroke: 'transparent'
    }
  }}
/>
<VictoryArea
  data={[
    { x: startDate, y: -0.2, y0: 0.2 },
    { x: endDate, y: -0.2, y0: 0.2 },
  ]}
  style={{
    data: {
      fill: theme.colors.neutral,
      fillOpacity: 0.05,
      stroke: 'transparent'
    }
  }}
/>
<VictoryArea
  data={[
    { x: startDate, y: -1.0, y0: -0.2 },
    { x: endDate, y: -1.0, y0: -0.2 },
  ]}
  style={{
    data: {
      fill: theme.colors.negative,
      fillOpacity: 0.1,
      stroke: 'transparent'
    }
  }}
/>
<VictoryLine
  data={sentimentData}
  style={{
    data: {
      stroke: theme.colors.primary,
      strokeWidth: 2
    }
  }}
  interpolation="natural"
/>
```

**Verification Checklist:**
- [ ] Chart renders with sentiment data
- [ ] Three color zones visible
- [ ] Trend line overlays zones
- [ ] Uses theme colors
- [ ] Responsive sizing
- [ ] Y-axis labeled correctly (-1 to 1)
- [ ] Works on web

**Testing Instructions:**
```typescript
// src/components/charts/__tests__/SentimentChart.test.tsx
import { render } from '@testing-library/react-native';
import { SentimentChart } from '../SentimentChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme';

const mockSentimentData = [
  { date: '2025-11-01', sentimentScore: 0.5 },
  { date: '2025-11-02', sentimentScore: 0.3 },
  { date: '2025-11-03', sentimentScore: -0.1 },
];

describe('SentimentChart', () => {
  it('renders sentiment zones and trend line', () => {
    const { UNSAFE_getAllByType } = render(
      <SentimentChart data={mockSentimentData} />,
      { wrapper: ({ children }) => <PaperProvider theme={theme}>{children}</PaperProvider> }
    );

    const areas = UNSAFE_getAllByType('VictoryArea');
    expect(areas.length).toBeGreaterThanOrEqual(3); // 3 zones

    const lines = UNSAFE_getAllByType('VictoryLine');
    expect(lines.length).toBeGreaterThanOrEqual(1); // trend line
  });
});
```

**Commit Message Template:**
```
feat(charts): add SentimentChart with color-coded zones

- Create sentiment trend line chart
- Add positive/neutral/negative background zones
- Use Victory Native VictoryArea for zones
- Overlay trend line with VictoryLine
- Style with theme colors (green/gray/red zones)
```

**Estimated Tokens:** ~20,000

---

### Task 4: Create Mini Chart Component for Portfolio

**Goal:** Build small sparkline chart for portfolio items

**Files to Modify/Create:**
- `src/components/charts/MiniChart.tsx` - NEW component
- `src/components/charts/index.ts` - Add export

**Prerequisites:**
- Task 2 complete (understand Victory Native area charts)

**Implementation Steps:**
1. Create `MiniChart.tsx` component
2. Use VictoryLine for simple line chart (no axes, minimal styling)
3. Accept props: `data`, `width`, `height`, `positive`
4. Create minimal chart with no axes, labels, or grid
5. Use positive/negative color for line
6. Make it very compact (40-60px wide, 24-30px high)
7. Optimize for performance (fewer data points)

**Component Interface:**
```typescript
interface MiniChartProps {
  data: Array<{ x: Date; y: number }>;
  width?: number;
  height?: number;
  positive?: boolean;
}
```

**Implementation Guidance:**
- Width: 50-60px
- Height: 24-30px
- No padding (maximize chart space)
- No axes, no labels, no grid
- Just a simple line
- Line color: green if positive, red if negative
- Stroke width: 1-1.5px
- Interpolation: "natural"
- Limit data points (sample to 10-15 max for performance)

**Minimal Chart Configuration:**
```typescript
<VictoryChart
  width={width || 60}
  height={height || 28}
  padding={0}
>
  <VictoryLine
    data={data}
    style={{
      data: {
        stroke: positive ? theme.colors.positive : theme.colors.negative,
        strokeWidth: 1.5
      }
    }}
    interpolation="natural"
  />
</VictoryChart>
```

**Verification Checklist:**
- [ ] Renders small chart
- [ ] No axes or labels (minimal)
- [ ] Uses positive/negative colors
- [ ] Compact size (fits in portfolio item)
- [ ] Good performance (renders quickly)
- [ ] Works on web

**Testing Instructions:**
```typescript
// src/components/charts/__tests__/MiniChart.test.tsx
describe('MiniChart', () => {
  it('renders compact chart without axes', () => {
    const { UNSAFE_getByType } = render(<MiniChart data={mockData} positive />);

    const chart = UNSAFE_getByType('VictoryChart');
    expect(chart.props.padding).toBe(0);
    expect(chart.props.width).toBeLessThan(100);
    expect(chart.props.height).toBeLessThan(50);
  });

  it('uses green line for positive trend', () => {
    const { UNSAFE_getByType } = render(<MiniChart data={mockData} positive />);

    const line = UNSAFE_getByType('VictoryLine');
    expect(line.props.style.data.stroke).toBe(theme.colors.positive);
  });
});
```

**Commit Message Template:**
```
feat(charts): add MiniChart sparkline for portfolio items

- Create compact sparkline chart component
- Remove axes and labels for minimal design
- Support positive/negative color variants
- Optimize for small size and performance
```

**Estimated Tokens:** ~12,000

---

### Task 5: Integrate PriceChart into Stock Detail Screen

**Goal:** Add price chart to stock detail screen's price tab

**Files to Modify/Create:**
- `app/(tabs)/stock/[ticker]/index.tsx` - Add chart to price screen

**Prerequisites:**
- Task 1 and 2 complete (useChartData and PriceChart available)
- Understand stock detail screen structure

**Implementation Steps:**
1. Read existing price screen (stock/[ticker]/index.tsx)
2. Import PriceChart and useChartData
3. Transform stock price data using useChartData
4. Add PriceChart component above or below price list
5. Use StockDetailContext to get price data
6. Handle loading state (show skeleton)
7. Handle empty state (no chart if no data)
8. Ensure responsive sizing

**Layout Structure:**
```
Stock Detail Screen (Price Tab):
                             
 [Stock Header - sticky]     
                             $
                             
   [Price Chart]             
   (200-250px height)        
                             
                             $
 Date         Price   Change 
 Nov 15      $186.40  +2.3%  
 Nov 14      $182.10  -1.2%  
 ...                         
                             
```

**Implementation Guidance:**
- Place chart in card or section container
- Add padding around chart
- Use full screen width minus margins
- Show skeleton during load
- Fade in chart when data ready
- Keep existing price list below chart

**Verification Checklist:**
- [ ] Chart displays on price tab
- [ ] Chart uses stock price data
- [ ] Skeleton shown during load
- [ ] Chart responsive to screen size
- [ ] Price list still visible below chart
- [ ] No layout issues

**Testing Instructions:**
Manual testing:
1. Navigate to stock detail screen
2. Verify chart appears on price tab
3. Verify chart shows correct data
4. Resize browser window
5. Verify chart resizes responsively

**Commit Message Template:**
```
feat(stock-detail): integrate price chart on price tab

- Add PriceChart component to price screen
- Transform stock data with useChartData
- Show skeleton during load
- Place chart above price list
- Ensure responsive sizing
```

**Estimated Tokens:** ~10,000

---

### Task 6: Integrate SentimentChart into Sentiment Screen

**Goal:** Add sentiment visualization to sentiment tab

**Files to Modify/Create:**
- `app/(tabs)/stock/[ticker]/sentiment.tsx` - Add chart to sentiment screen

**Prerequisites:**
- Task 1 and 3 complete (useChartData and SentimentChart available)

**Implementation Steps:**
1. Read existing sentiment screen
2. Import SentimentChart and useChartData
3. Transform sentiment data using useChartData
4. Add SentimentChart above sentiment list
5. Use StockDetailContext to get sentiment data
6. Handle loading state (skeleton)
7. Handle empty state
8. Ensure responsive sizing

**Layout Structure:**
```
Sentiment Tab:
                             
                             
   [Sentiment Chart]         
   (with color zones)        
                             
                             $
 Date    Score  Classification
 Nov 15  +0.65  POSITIVE     
 Nov 14  +0.32  POSITIVE     
 ...                         
                             
```

**Implementation Guidance:**
- Place chart in prominent position (top)
- Use full width
- Height: 200-250px
- Show skeleton during sentiment processing
- Keep existing sentiment list/items below

**Verification Checklist:**
- [ ] Chart displays on sentiment tab
- [ ] Chart shows color zones
- [ ] Trend line visible
- [ ] Skeleton during load
- [ ] Responsive sizing
- [ ] Sentiment list preserved below

**Testing Instructions:**
Manual testing:
1. Navigate to sentiment tab
2. Verify chart displays
3. Verify zones and trend line
4. Check loading state
5. Test responsiveness

**Commit Message Template:**
```
feat(stock-detail): integrate sentiment chart on sentiment tab

- Add SentimentChart with color zones
- Transform sentiment data for Victory Native
- Show skeleton during processing
- Place chart above sentiment list
```

**Estimated Tokens:** ~10,000

---

### Task 7: Add MiniChart to Portfolio Items

**Goal:** Display mini sparkline in portfolio item cards

**Files to Modify/Create:**
- `src/components/portfolio/PortfolioItem.tsx` - Add mini chart

**Prerequisites:**
- Task 4 complete (MiniChart available)
- Phase 2 Task 2 complete (redesigned PortfolioItem)

**Implementation Steps:**
1. Read current PortfolioItem.tsx
2. Import MiniChart
3. Fetch or receive recent price data for sparkline (last 7-30 days)
4. Add MiniChart to right side of card (after price/change)
5. Position chart to align with price line
6. Pass positive/negative prop based on overall trend
7. Handle cases where chart data unavailable (hide chart)

**Layout Update:**
```
Before:
                                    
 AAPL  Apple Inc.                  
 $186.40  +2.35% ‘                 
                                    

After:
                                    
 AAPL  Apple Inc.              =È     <- MiniChart here
 $186.40  +2.35% ‘                 
                                    
```

**Implementation Guidance:**
- Chart width: 50-60px
- Chart height: 24-28px
- Position: right side of first line
- Align vertically with ticker/name
- Use flexbox to position
- Sample price data to 10-15 points for performance
- Show only if data available

**Verification Checklist:**
- [ ] Mini chart visible in portfolio items
- [ ] Chart positioned correctly
- [ ] Uses positive/negative colors
- [ ] Doesn't break layout
- [ ] Good performance (no lag)
- [ ] Gracefully handles missing data

**Testing Instructions:**
```typescript
describe('PortfolioItem with MiniChart', () => {
  it('renders mini chart when data available', () => {
    const itemWithChartData = { ...mockItem, priceHistory: [...] };
    const { UNSAFE_getByType } = render(
      <PortfolioItem item={itemWithChartData} />
    );

    expect(UNSAFE_getByType('MiniChart')).toBeTruthy();
  });

  it('hides chart when data unavailable', () => {
    const itemWithoutChartData = { ...mockItem, priceHistory: null };
    const { UNSAFE_queryByType } = render(
      <PortfolioItem item={itemWithoutChartData} />
    );

    expect(UNSAFE_queryByType('MiniChart')).toBeNull();
  });
});
```

**Commit Message Template:**
```
feat(portfolio): add mini sparkline charts to portfolio items

- Integrate MiniChart component
- Show 7-day price trend sparkline
- Position on right side of card
- Use positive/negative colors
- Handle missing data gracefully
```

**Estimated Tokens:** ~10,000

---

### Task 8: Update Stock Header for Spacious Layout

**Goal:** Make stock detail header more spacious with clear visual hierarchy

**Files to Modify/Create:**
- `app/(tabs)/stock/[ticker]/_layout.tsx` - Update header styling
- `src/components/stock/StockMetadataCard.tsx` - Make more spacious

**Prerequisites:**
- Phase 2 complete (understand context-dependent density)
- Charts integrated (Tasks 5-6)

**Implementation Steps:**
1. Read current stock detail layout and header
2. Increase padding and spacing in header
3. Make stock name/ticker more prominent (larger fonts)
4. Add more whitespace around elements
5. Update StockMetadataCard with generous padding
6. Increase font sizes for key metrics
7. Apply spacious layout values (opposite of dense lists)

**Visual Target:**
```
                                    
                                    
  AAPL                                <- Larger ticker
  Apple Inc.                          <- Larger company name
                                    
  $186.40  +2.35%                     <- Prominent price
                                    
                                    $
  Price | Sentiment | News            <- Tabs
                                    
```

**Implementation Guidance:**
- Ticker: 28-32px, bold
- Company name: 18-20px
- Price: 24-28px, MonoText
- Change: 16-18px, MonoText with color
- Padding: 20-24px (vs 12-16px for dense)
- Spacing between elements: 12-16px
- Card margin: 16px
- Touch targets: 48px minimum

**Verification Checklist:**
- [ ] Header more spacious
- [ ] Larger, more readable text
- [ ] Ample padding and spacing
- [ ] Contrast with dense list views
- [ ] MonoText for numbers
- [ ] Visual hierarchy clear

**Testing Instructions:**
Manual testing:
1. Navigate to stock detail
2. Compare header to list views
3. Verify spacious feel
4. Check readability
5. Verify on different screen sizes

**Commit Message Template:**
```
style(stock-detail): implement spacious layout for detail screen

- Increase header padding and spacing
- Enlarge ticker and company name fonts
- Make price and change more prominent
- Apply spacious layout values throughout
- Create clear visual hierarchy
```

**Estimated Tokens:** ~10,000

---

## Phase Verification

Before proceeding to Phase 4:

### Automated Verification

```bash
npm test
npm run type-check
```

All tests pass, no TypeScript errors.

### Visual Verification

**Stock Detail Screen:**
- [ ] Price chart displays on price tab
- [ ] Chart uses area with gradient (green/red)
- [ ] Chart responsive to width
- [ ] Sentiment chart on sentiment tab
- [ ] Sentiment zones visible (green/gray/red)
- [ ] Header spacious and readable
- [ ] MonoText used throughout

**Portfolio Screen:**
- [ ] Mini charts visible in items
- [ ] Charts show 7-day trends
- [ ] Charts use positive/negative colors
- [ ] No performance issues

**Charts:**
- [ ] All charts use theme colors
- [ ] Smooth animations
- [ ] Axes labeled correctly
- [ ] Grid lines subtle

### Performance Testing

**Chart Rendering:**
1. Navigate to stock detail
2. Measure time to first chart render
3. Target: < 500ms
4. Verify smooth animations

**Scrolling with Mini Charts:**
1. Load 20+ portfolio items
2. Scroll rapidly
3. Verify 60fps maintained
4. No lag from mini charts

### Known Issues / Technical Debt

Document issues:
- _Victory Native web performance concerns_
- _Chart data sampling strategy_
- _Missing data handling_

---

## Integration Points

Phase 3 provides:

- **Phase 4**: Charts will have animations on data updates
- **Phase 5**: Web-specific chart optimizations

**Critical Exports:**
- PriceChart, SentimentChart, MiniChart components
- useChartData hook
- Chart styling patterns

---

**Phase 3 Complete!**

Proceed to **[Phase 4: Animations & Interactions](./Phase-4.md)**.
