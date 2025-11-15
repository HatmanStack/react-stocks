# Phase 0: Foundation

**Status:** Reference Document (applies to all phases)

This phase documents architecture decisions, design patterns, and shared conventions that apply across all implementation phases. Read this completely before starting any implementation work.

---

## Architecture Decision Records (ADRs)

### ADR-001: Dark Theme Implementation Strategy

**Decision:** Extend React Native Paper's MD3DarkTheme instead of building custom theme from scratch

**Rationale:**
- React Native Paper already installed and used throughout the app
- MD3DarkTheme provides Material Design 3 dark mode best practices (#121212 background)
- Cross-platform compatibility maintained (iOS, Android, Web)
- Customization points well-documented and type-safe
- Reduces implementation time and maintenance burden

**Alternatives Considered:**
- Custom theme system: Too much work, breaks cross-platform consistency
- Styled-components/Emotion: Would require rewriting all components
- NativeWind/Tailwind: Doesn't integrate well with React Native Paper

**Implications:**
- Continue using `useTheme()` hook from React Native Paper
- Theme colors accessible via `theme.colors.*`
- Custom additions via `theme.custom.*` property
- Type augmentation needed for custom color properties

---

### ADR-002: Typography System - Monospaced Numbers

**Decision:** Use platform-specific monospaced fonts for numeric data, sans-serif for labels

**Implementation:**
```typescript
// Numbers: Menlo (iOS), Roboto Mono (Android), Monaco (Web)
// Labels: System default sans-serif
```

**Rationale:**
- Financial apps require aligned columns for easy scanning
- Monospaced fonts prevent layout shift when numbers update
- Platform-specific fonts ensure native feel and performance
- No custom font loading reduces bundle size

**Where to Apply:**
- Stock prices, percentages, volume numbers
- Portfolio balance, gains/losses
- Sentiment scores
- Chart axis labels

**Where NOT to Apply:**
- Headlines, article titles
- Company names, ticker symbols
- Button labels, navigation
- Descriptive text

---

### ADR-003: Information Density - Context-Dependent

**Decision:** Implement dense layouts for list views, spacious layouts for detail screens

**Dense Layouts (Portfolio, Search, News Lists):**
- Compact card spacing (4-8px margins)
- Two-line maximum per item
- Small font sizes (12-14px)
- Mini charts (sparklines)
- Show 8-12 items per screen

**Spacious Layouts (Stock Detail Screen):**
- Generous padding (16-24px)
- Large, readable charts
- Clear visual hierarchy
- Focus on single stock's data
- Ample touch targets (44px minimum)

**Rationale:**
- Users scan lists to find stocks of interest (requires density)
- Users study detail screens to make decisions (requires clarity)
- Matches Bloomberg (dense lists) + Robinhood (spacious details) patterns

---

### ADR-004: Chart Library - Victory Native

**Decision:** Use Victory Native for all data visualization

**Rationale:**
- Cross-platform (uses react-native-svg, works on web/mobile)
- Declarative API matches React paradigms
- Built-in animations and interactions
- Good documentation and TypeScript support
- Active maintenance

**Alternatives Considered:**
- Recharts: Web-only, not cross-platform
- react-native-chart-kit: Limited customization
- D3.js: Too low-level, requires custom React wrappers

**Chart Types:**
- **Price**: VictoryArea with gradient fill
- **Sentiment**: VictoryLine with background zones (VictoryArea for zones)
- **Mini charts**: VictoryLine (simplified, no axes)

**Performance Considerations:**
- Limit data points to 90 days max for performance
- Use `interpolation="natural"` for smooth curves
- Implement data sampling for very large datasets

---

### ADR-005: Loading States - Skeleton Screens

**Decision:** Use skeleton screens (placeholder boxes) instead of spinners

**Implementation Pattern:**
```typescript
// Show gray boxes matching final content layout
// Smooth fade-in when real data loads
// No shimmer/pulse effects (keep it simple and professional)
```

**Rationale:**
- Reduces perceived loading time
- Users understand layout before data arrives
- More professional than spinners
- Bloomberg and modern financial apps use this pattern

**Where to Apply:**
- Portfolio list while loading
- Stock detail screen (price, metadata)
- News feed while fetching articles
- Search results during API calls

---

### ADR-006: Animation Timing

**Decision:** Use Material Design motion guidelines

**Standard Durations:**
- Micro-interactions: 150ms (button press, card tap)
- Screen transitions: 300ms (navigation, modal open/close)
- Data updates: 200ms (number changes, chart updates)
- Skeleton fade-in: 200ms

**Easing:**
- Enter: `cubic-bezier(0.0, 0.0, 0.2, 1)` - deceleration
- Exit: `cubic-bezier(0.4, 0.0, 1, 1)` - acceleration
- Standard: `cubic-bezier(0.4, 0.0, 0.2, 1)` - most transitions

**Performance:**
- Use `react-native-reanimated` for smooth 60fps animations
- Avoid animating expensive properties (avoid `width`, prefer `transform: scale`)
- Run animations on UI thread when possible

---

### ADR-007: Color System - Financial Semantics

**Decision:** Reserve green/red exclusively for financial gains/losses

**Color Usage Rules:**
```
Green (#4CAF50): Positive price movement, gains, up arrows
Red (#F44336): Negative price movement, losses, down arrows
Blue (#2196F3): Primary actions, links, informational
Gray (#9E9E9E): Neutral sentiment, disabled states
Yellow (#FF9800): Warnings (not used for financial data)
```

**Rationale:**
- Users associate green=good, red=bad in financial context
- Consistency with every trading platform globally
- Accessibility: Don't rely on color alone (add arrows, +/- symbols)

**Avoid:**
- Using green for success messages in financial context (confusing)
- Using red for errors when showing losses (redundant, alarming)
- Inverting colors for design purposes (never show gains in red)

---

## Design Patterns

### Pattern 1: Theme Hook Usage

**Always use the theme hook for colors:**

```typescript
import { useTheme } from 'react-native-paper';

function MyComponent() {
  const theme = useTheme();

  return (
    <View style={{ backgroundColor: theme.colors.background }}>
      <Text style={{ color: theme.colors.onBackground }}>Text</Text>
    </View>
  );
}
```

**Never hardcode colors:**
```typescript
// L BAD
<View style={{ backgroundColor: '#121212' }}>

//  GOOD
<View style={{ backgroundColor: theme.colors.background }}>
```

---

### Pattern 2: Monospaced Number Rendering

**Create a reusable MonoText component:**

```typescript
// src/components/common/MonoText.tsx
import { Text, TextProps } from 'react-native';
import { useTheme } from 'react-native-paper';

interface MonoTextProps extends TextProps {
  variant?: 'price' | 'percentage' | 'volume';
  positive?: boolean;
  negative?: boolean;
}

export function MonoText({
  variant = 'price',
  positive,
  negative,
  style,
  ...props
}: MonoTextProps) {
  const theme = useTheme();

  // Determine color based on positive/negative
  const color = positive
    ? theme.colors.positive
    : negative
    ? theme.colors.negative
    : theme.colors.onSurface;

  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: theme.fonts.mono,
          color,
        },
        style
      ]}
    />
  );
}
```

**Usage:**
```typescript
<MonoText variant="price" positive={change > 0}>
  ${price.toFixed(2)}
</MonoText>
```

---

### Pattern 3: Skeleton Component Pattern

**Create base Skeleton component:**

```typescript
// src/components/common/Skeleton.tsx
import { View, ViewProps } from 'react-native';
import { useTheme } from 'react-native-paper';
import Animated, { FadeIn } from 'react-native-reanimated';

interface SkeletonProps extends ViewProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
  ...props
}: SkeletonProps) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.surfaceVariant,
        },
        style
      ]}
    />
  );
}
```

**Usage:**
```typescript
// Show skeleton while loading
{isLoading ? (
  <Skeleton width="80%" height={24} />
) : (
  <Animated.View entering={FadeIn.duration(200)}>
    <Text>{data.title}</Text>
  </Animated.View>
)}
```

---

### Pattern 4: Responsive Density

**Use hook to determine layout density:**

```typescript
// src/hooks/useLayoutDensity.ts
import { useWindowDimensions } from 'react-native';

export function useLayoutDensity() {
  const { width } = useWindowDimensions();

  // Dense layout for narrower screens, spacious for wider
  const isDense = width < 768; // tablet breakpoint

  return {
    isDense,
    cardSpacing: isDense ? 6 : 12,
    cardPadding: isDense ? 12 : 16,
    fontSize: {
      title: isDense ? 14 : 16,
      subtitle: isDense ? 12 : 14,
      caption: isDense ? 10 : 12,
    }
  };
}
```

**Usage:**
```typescript
function PortfolioItem() {
  const { isDense, cardSpacing, cardPadding } = useLayoutDensity();

  return (
    <Card style={{ marginVertical: cardSpacing, padding: cardPadding }}>
      {/* ... */}
    </Card>
  );
}
```

---

### Pattern 5: Chart Component Structure

**Consistent pattern for all charts:**

```typescript
import { VictoryArea, VictoryChart, VictoryAxis } from 'victory-native';
import { useTheme } from 'react-native-paper';

interface PriceChartProps {
  data: Array<{ x: Date; y: number }>;
  positive?: boolean; // determines gradient color
}

export function PriceChart({ data, positive }: PriceChartProps) {
  const theme = useTheme();

  return (
    <VictoryChart /* ... */>
      <VictoryAxis /* styling with theme colors */ />
      <VictoryArea
        data={data}
        style={{
          data: {
            fill: positive ? theme.colors.positive : theme.colors.negative,
            fillOpacity: 0.2,
            stroke: positive ? theme.colors.positive : theme.colors.negative,
            strokeWidth: 2,
          }
        }}
      />
    </VictoryChart>
  );
}
```

---

## Testing Strategy

### Unit Tests

**Every new component must have:**
1. Snapshot test (basic render)
2. Prop variation tests
3. Interaction tests (button press, etc.)
4. Theme integration test (renders with dark theme)

**Example:**
```typescript
describe('MonoText', () => {
  it('renders with monospaced font', () => {
    const { getByText } = render(<MonoText>$123.45</MonoText>);
    expect(getByText('$123.45')).toHaveStyle({ fontFamily: expect.stringContaining('Mono') });
  });

  it('applies positive color when positive prop is true', () => {
    const { getByText } = render(<MonoText positive>+5.2%</MonoText>);
    // Assert color matches theme.colors.positive
  });
});
```

### Visual Regression Tests

**Critical screens to snapshot:**
- Portfolio list (dense layout)
- Stock detail (spacious layout)
- News feed (dense cards)
- Charts (price and sentiment)

**Use React Native Testing Library:**
```typescript
import { render } from '@testing-library/react-native';

it('matches snapshot for dark theme', () => {
  const { toJSON } = render(<PortfolioScreen />, {
    wrapper: ({ children }) => (
      <PaperProvider theme={darkTheme}>
        {children}
      </PaperProvider>
    )
  });
  expect(toJSON()).toMatchSnapshot();
});
```

### Integration Tests

**Key flows to test:**
1. Portfolio list ’ Stock detail navigation
2. Search ’ Add to portfolio
3. Chart data loading and rendering
4. Skeleton ’ Real data transition

---

## Common Pitfalls to Avoid

### Pitfall 1: Hardcoding Dark Theme Colors

**L Wrong:**
```typescript
<View style={{ backgroundColor: '#1e1e1e' }} />
```

** Correct:**
```typescript
const theme = useTheme();
<View style={{ backgroundColor: theme.colors.surface }} />
```

**Why:** Theme colors might change, and hardcoding breaks maintainability.

---

### Pitfall 2: Inconsistent Number Formatting

**L Wrong:**
```typescript
<Text>${price}</Text> // Shows $123.456789
<Text>${otherPrice.toFixed(2)}</Text> // Shows $123.45
```

** Correct:**
```typescript
// Create utility function
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

<MonoText>{formatPrice(price)}</MonoText>
```

---

### Pitfall 3: Blocking the Main Thread with Animations

**L Wrong:**
```typescript
// JS thread animation (janky)
Animated.timing(value, {
  toValue: 1,
  duration: 300,
  useNativeDriver: false, // L
});
```

** Correct:**
```typescript
// UI thread animation (smooth)
import Animated, { withTiming } from 'react-native-reanimated';

value.value = withTiming(1, { duration: 300 });
```

---

### Pitfall 4: Skeleton Screen Doesn't Match Final Layout

**L Wrong:**
```typescript
// Skeleton: 3 boxes
<Skeleton height={20} />
<Skeleton height={20} />
<Skeleton height={20} />

// Real data: Title + subtitle + description (different structure)
```

** Correct:**
```typescript
// Match the exact structure
{isLoading ? (
  <>
    <Skeleton width="80%" height={24} /> {/* Title */}
    <Skeleton width="60%" height={16} style={{ marginTop: 8 }} /> {/* Subtitle */}
    <Skeleton width="100%" height={60} style={{ marginTop: 12 }} /> {/* Description */}
  </>
) : (
  <>
    <Text variant="titleLarge">{data.title}</Text>
    <Text variant="bodyMedium">{data.subtitle}</Text>
    <Text variant="bodySmall">{data.description}</Text>
  </>
)}
```

---

### Pitfall 5: Using Victory Native Without Proper Sizing

**L Wrong:**
```typescript
<VictoryChart>
  {/* No width/height specified, renders tiny or broken */}
</VictoryChart>
```

** Correct:**
```typescript
import { useWindowDimensions } from 'react-native';

function PriceChart() {
  const { width } = useWindowDimensions();

  return (
    <VictoryChart
      width={width - 32} // Account for padding
      height={200}
    >
      {/* ... */}
    </VictoryChart>
  );
}
```

---

## File Organization

### Theme Files Structure

```
src/theme/
     theme.ts          # Main theme export (updated to dark)
     colors.ts         # Dark color palette
     typography.ts     # Monospaced fonts + hierarchy
     index.ts          # Re-exports
```

### Component Structure

```
src/components/
     common/
        MonoText.tsx       # NEW: Monospaced number component
        Skeleton.tsx       # NEW: Skeleton loader component
        ...existing...
     charts/              # NEW: Chart components
        PriceChart.tsx
        SentimentChart.tsx
        MiniChart.tsx
     ...existing...
```

### Hook Organization

```
src/hooks/
     useLayoutDensity.ts    # NEW: Context-dependent density
     useChartData.ts        # NEW: Chart data formatting
     ...existing...
```

---

## Commit Message Conventions

Use Conventional Commits format:

```
type(scope): brief description

- Detail 1
- Detail 2
- Detail 3
```

**Types:**
- `feat`: New feature (dark theme, chart component)
- `style`: Visual styling changes (colors, spacing)
- `refactor`: Code restructuring without behavior change
- `test`: Adding or updating tests
- `docs`: Documentation updates
- `fix`: Bug fixes

**Scopes:**
- `theme`: Theme system changes
- `typography`: Font and text styling
- `charts`: Victory Native chart components
- `portfolio`: Portfolio screen
- `search`: Search screen
- `news`: News feed
- `stock-detail`: Stock detail screen
- `skeleton`: Loading states

**Examples:**
```
feat(theme): implement dark theme with MD3 colors

- Extend MD3DarkTheme from React Native Paper
- Add dark color palette (#121212 background)
- Configure custom colors for gains/losses
- Add type augmentation for custom theme properties
```

```
feat(typography): add monospaced number component

- Create MonoText component with platform-specific fonts
- Support positive/negative color variants
- Add formatPrice utility function
- Update portfolio items to use MonoText
```

---

## Development Workflow

1. **Read the phase file completely** before writing any code
2. **Install dependencies** listed in phase prerequisites
3. **Write tests first** (TDD approach)
4. **Implement feature** following patterns in Phase 0
5. **Run tests** and ensure they pass
6. **Manual testing** in web browser (web-first priority)
7. **Commit with conventional message**
8. **Verify task checklist** before moving to next task

---

## Performance Targets

- **First Paint**: <1s (skeleton screens visible)
- **Interactive**: <2s (buttons respond to touch)
- **Chart Render**: <500ms (Victory Native chart displays)
- **List Scroll**: 60fps (no jank on portfolio/news lists)
- **Animation Smoothness**: 60fps (all transitions)

---

## Browser Support (Web-First)

**Primary Targets:**
- Chrome 90+ (primary testing browser)
- Firefox 88+
- Safari 14+
- Edge 90+

**Mobile Browsers:**
- Safari iOS 14+
- Chrome Android 90+

**Note:** While cross-platform, prioritize web experience. Mobile native can have slightly different optimizations if needed.

---

This foundation document should be referenced throughout all phases. When in doubt about architecture decisions, patterns, or conventions, return to Phase 0.

**Ready to begin implementation?** ’ Proceed to **[Phase 1: Dark Theme Implementation](./Phase-1.md)**
