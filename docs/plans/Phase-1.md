# Phase 1: Dark Theme Implementation

## Phase Goal

Implement a professional dark theme based on Material Design 3 with financial-focused color semantics and monospaced typography for numeric data. This phase establishes the visual foundation that all subsequent phases will build upon.

**Success Criteria:**
- Dark theme active throughout the app (#121212 - #1e1e1e backgrounds)
- Green/red colors properly applied to financial gains/losses
- Monospaced fonts rendering all numeric data
- Theme switches cleanly without requiring app restart
- All existing functionality works with dark theme

**Estimated Tokens:** ~100,000

---

## Prerequisites

- Phase 0 read and understood
- Git working directory clean or changes committed
- All existing tests passing (`npm test`)
- Dependencies installed:
  ```bash
  npm install  # Ensure React Native Paper v5.14+ installed
  ```

---

## Tasks

### Task 0: Verify Project Structure and Theme Files

**Goal:** Ensure expected file structure exists before modifying theme files

**Files to Check:**
- `src/theme/colors.ts` - Color definitions
- `src/theme/typography.ts` - Font configurations
- `src/theme/theme.ts` - Main theme export
- `src/theme/index.ts` - Re-exports
- `app/_layout.tsx` - Root layout with theme provider

**Implementation Steps:**
1. Check if `src/theme/` directory exists
2. List files in theme directory: `ls -la src/theme/`
3. If `colors.ts`, `typography.ts`, or `theme.ts` don't exist, note their absence
4. Review existing theme implementation to understand current structure
5. Document any deviations from expected structure

**Fallback Strategy (if files don't exist):**

If theme files are missing or structured differently:
1. Document the actual structure you find
2. Create missing files following this pattern:
   ```typescript
   // src/theme/colors.ts (if missing)
   export const colors = {
     // Add colors as discovered in existing code
   };

   // src/theme/typography.ts (if missing)
   export const typography = {
     fonts: {
       // Add fonts as discovered
     }
   };

   // src/theme/theme.ts (if missing)
   import { MD3LightTheme } from 'react-native-paper';
   import { colors } from './colors';

   export const theme = {
     ...MD3LightTheme,
     colors,
   };
   ```
3. Proceed with remaining tasks, adapting file paths as needed

**Verification Checklist:**
- [ ] `src/theme/` directory exists
- [ ] Theme-related files identified (document actual paths)
- [ ] Current theme structure documented
- [ ] Baseline tests pass: `npm test`
- [ ] No TypeScript errors: `npm run type-check`

**Testing Instructions:**
Run baseline tests to ensure nothing is broken:
```bash
npm test
npm run type-check
```

**Commit Message Template:**
```
docs(phase-1): verify theme structure before modifications

- Document existing theme file structure
- Note any deviations from expected layout
- Establish baseline test results
```

**Estimated Tokens:** ~5,000

---

### Task 1: Install Victory Native Dependencies

**Goal:** Install charting library and required peer dependencies for future phases

**Files to Modify/Create:**
- `package.json` - Add dependencies

**Implementation Steps:**
1. Install Victory Native and required peer dependencies
2. Verify installation by checking package.json
3. Run `npm install` to ensure no conflicts
4. Check that metro bundler still starts successfully

**Dependencies to Install:**
```bash
npm install victory-native react-native-svg
```

**Verification Checklist:**
- [ ] `victory-native` appears in package.json dependencies
- [ ] `react-native-svg` appears in package.json dependencies
- [ ] `npm install` completes without errors
- [ ] No peer dependency warnings in npm output
- [ ] Victory Native version compatible with Expo SDK 54 (check package.json)
- [ ] `npm start` launches Expo dev server successfully
- [ ] No new TypeScript errors (`npm run type-check`)

**Compatibility Note:**
If you encounter peer dependency warnings, check Victory Native's documentation for Expo SDK 54 compatibility. You may need to install specific versions:
```bash
npm install victory-native@[compatible-version] react-native-svg@[compatible-version]
```

**Testing Instructions:**
No unit tests required for dependency installation. Verify by running type-check and ensuring app builds.

**Commit Message Template:**
```
chore(deps): install Victory Native for charting

- Add victory-native for professional charts
- Add react-native-svg peer dependency
- Prepare for price and sentiment visualization
```

**Estimated Tokens:** ~1,000

---

### Task 2: Create Dark Color Palette

**Goal:** Replace light theme colors with dark theme palette following Material Design 3 guidelines

**Files to Modify/Create:**
- `src/theme/colors.ts` - Update color definitions

**Prerequisites:**
- Task 1 complete
- Understand ADR-007 (Color System - Financial Semantics) from Phase 0

**Implementation Steps:**
1. Read the existing `src/theme/colors.ts` file to understand current structure
2. Replace light colors with dark equivalents while maintaining the same export structure
3. Use Material Design 3 dark theme guidelines:
   - Background: #121212 to #1e1e1e range
   - Surface: Slightly lighter than background (#1e1e1e to #2c2c2c)
   - Text: High contrast on dark backgrounds (#FFFFFF, #B3B3B3, #808080)
4. Keep existing financial semantic colors (positive green, negative red) but ensure they work on dark backgrounds
5. Add any missing dark theme colors (surfaceVariant, outline, etc.)

**Key Color Requirements:**
- Primary: Keep blue (#2196F3 or similar) - good contrast on dark
- Background: #121212 (Material dark baseline)
- Surface: #1e1e1e (cards, modals)
- Surface Variant: #2c2c2c (differentiated surfaces)
- On Background: #FFFFFF (primary text)
- On Surface: #E0E0E0 (card text)
- Positive: #4CAF50 (gains) - verify contrast ratio e 4.5:1
- Negative: #F44336 (losses) - verify contrast ratio e 4.5:1

**Verification Checklist:**
- [ ] All existing color exports maintained (no breaking changes)
- [ ] Background color is in #121212 - #1e1e1e range
- [ ] Text colors have sufficient contrast (use WebAIM contrast checker)
- [ ] Green and red colors visible on dark background
- [ ] No hardcoded hex values elsewhere in codebase (all use theme)

**Testing Instructions:**
Create a test file to verify color contrast:

```typescript
// src/theme/__tests__/colors.test.ts
describe('Dark Color Palette', () => {
  it('has dark background colors', () => {
    expect(colors.background).toMatch(/#1[0-9a-f]{5}/i);
  });

  it('maintains financial semantic colors', () => {
    expect(colors.positive).toBe('#4CAF50');
    expect(colors.negative).toBe('#F44336');
  });

  // Add contrast ratio tests if desired
});
```

**Commit Message Template:**
```
style(theme): implement dark color palette

- Replace light backgrounds with #121212-#1e1e1e range
- Update surface colors for dark theme
- Ensure text colors have proper contrast ratios
- Maintain green/red financial semantic colors
```

**Estimated Tokens:** ~8,000

---

### Task 3: Add Monospaced Font Configuration

**Goal:** Configure platform-specific monospaced fonts for financial data display

**Files to Modify/Create:**
- `src/theme/typography.ts` - Add mono font configuration

**Prerequisites:**
- Task 2 complete
- Understand ADR-002 (Typography System) from Phase 0

**Implementation Steps:**
1. Read existing `src/theme/typography.ts` to understand structure
2. Add monospaced font configuration with platform detection:
   - iOS: 'Menlo' or 'Courier New'
   - Android: 'Roboto Mono' or 'monospace'
   - Web: 'Monaco', 'Consolas', or 'Courier New'
3. Use React Native's Platform API to select appropriate font
4. Add mono font to the fonts object in typography
5. Consider fallback chain for maximum compatibility

**Font Selection Logic:**
```typescript
import { Platform } from 'react-native';

const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace', // Uses Roboto Mono on modern Android
  web: 'Monaco, Consolas, Courier New, monospace',
  default: 'monospace',
});
```

**Verification Checklist:**
- [ ] Mono font configured for all platforms (ios, android, web)
- [ ] Fallback fonts specified for web
- [ ] No additional font files needed (use system fonts only)
- [ ] Typography object structure maintained
- [ ] TypeScript types updated if needed

**Testing Instructions:**
```typescript
// src/theme/__tests__/typography.test.ts
describe('Typography', () => {
  it('includes monospaced font configuration', () => {
    expect(typography.fonts.mono).toBeDefined();
  });

  it('uses system mono fonts (no custom font loading)', () => {
    // Verify no .ttf or .otf imports
    expect(typography.fonts.mono).toMatch(/menlo|monospace|monaco/i);
  });
});
```

**Commit Message Template:**
```
feat(typography): add monospaced font configuration

- Configure platform-specific mono fonts (Menlo, Roboto Mono, Monaco)
- Add fallback chain for web compatibility
- Prepare for MonoText component implementation
```

**Estimated Tokens:** ~6,000

---

### Task 4: Update Theme Configuration for Dark Mode

**Goal:** Switch main theme from MD3LightTheme to MD3DarkTheme and apply custom colors

**Files to Modify/Create:**
- `src/theme/theme.ts` - Switch to dark theme base

**Prerequisites:**
- Tasks 1-3 complete
- Understand ADR-001 (Dark Theme Strategy) from Phase 0

**Implementation Steps:**
1. Read existing `src/theme/theme.ts` to see current light theme configuration
2. Import `MD3DarkTheme` instead of `MD3LightTheme` from `react-native-paper`
3. Spread `MD3DarkTheme` as base and override with custom dark colors
4. Ensure custom theme additions (spacing, borderRadius, shadows, typography) are preserved
5. Update TypeScript types to include mono font

**Key Changes:**
```typescript
// Before
import { MD3LightTheme } from 'react-native-paper';
export const theme = {
  ...MD3LightTheme,
  colors: { /* custom colors */ }
};

// After
import { MD3DarkTheme } from 'react-native-paper';
export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    // Override with custom dark colors from colors.ts
  },
  // Add mono font to fonts
  fonts: {
    ...MD3DarkTheme.fonts,
    mono: typography.fonts.mono,
  }
};
```

**Verification Checklist:**
- [ ] Theme extends MD3DarkTheme instead of MD3LightTheme
- [ ] Custom colors from colors.ts applied to theme.colors
- [ ] Mono font accessible via theme.fonts.mono
- [ ] Custom properties (spacing, borderRadius, shadows) preserved
- [ ] TypeScript types include mono font in theme.fonts

**Testing Instructions:**
```typescript
// src/theme/__tests__/theme.test.ts
import { theme } from '../theme';

describe('Dark Theme', () => {
  it('uses dark background color', () => {
    expect(theme.colors.background).toMatch(/#1[0-9a-f]{5}/i);
  });

  it('includes mono font in fonts', () => {
    expect(theme.fonts.mono).toBeDefined();
  });

  it('preserves custom theme properties', () => {
    expect(theme.custom).toBeDefined();
    expect(theme.custom.spacing).toBeDefined();
  });
});
```

**Commit Message Template:**
```
feat(theme): switch to Material Design 3 dark theme

- Replace MD3LightTheme with MD3DarkTheme
- Apply custom dark color palette
- Add mono font to theme.fonts
- Preserve custom spacing and border radius
```

**Estimated Tokens:** ~10,000

---

### Task 5: Create MonoText Component

**Goal:** Build reusable component for rendering financial numbers with monospaced fonts

**Files to Modify/Create:**
- `src/components/common/MonoText.tsx` - NEW component
- `src/components/common/index.ts` - Add export

**Prerequisites:**
- Task 4 complete
- Understand Pattern 2 (Monospaced Number Rendering) from Phase 0

**Implementation Steps:**
1. Create `MonoText.tsx` component that extends Text props
2. Use `useTheme()` hook to access mono font and colors
3. Support props: `variant` (price/percentage/volume), `positive`, `negative`
4. Apply color based on positive/negative props (green/red)
5. Default to theme.colors.onSurface for neutral numbers
6. Export from index.ts for easy imports

**Component Interface:**
```typescript
interface MonoTextProps extends TextProps {
  variant?: 'price' | 'percentage' | 'volume';
  positive?: boolean;
  negative?: boolean;
  children: React.ReactNode;
}
```

**Implementation Guidance:**
- Use `theme.fonts.mono` for fontFamily
- Determine color: positive � green, negative � red, default � onSurface
- Variant affects fontSize: price (16), percentage (14), volume (12)
- Merge custom styles with default styles (allow overrides)

**Verification Checklist:**
- [ ] Component renders with monospaced font
- [ ] Positive prop applies green color
- [ ] Negative prop applies red color
- [ ] Neutral numbers use default text color
- [ ] Variant prop changes font size appropriately
- [ ] Exported from src/components/common/index.ts

**Testing Instructions:**
```typescript
// src/components/common/__tests__/MonoText.test.tsx
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { MonoText } from '../MonoText';
import { theme } from '@/theme';

describe('MonoText', () => {
  const wrapper = ({ children }) => (
    <PaperProvider theme={theme}>{children}</PaperProvider>
  );

  it('renders with monospaced font', () => {
    const { getByText } = render(<MonoText>$123.45</MonoText>, { wrapper });
    const element = getByText('$123.45');
    expect(element.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: expect.stringMatching(/mono/i) })
      ])
    );
  });

  it('applies green color when positive', () => {
    const { getByText } = render(<MonoText positive>+5.2%</MonoText>, { wrapper });
    const element = getByText('+5.2%');
    expect(element.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: theme.colors.positive })
      ])
    );
  });

  it('applies red color when negative', () => {
    const { getByText } = render(<MonoText negative>-3.1%</MonoText>, { wrapper });
    const element = getByText('-3.1%');
    expect(element.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: theme.colors.negative })
      ])
    );
  });

  it('matches snapshot', () => {
    const { toJSON } = render(<MonoText variant="price">$999.99</MonoText>, { wrapper });
    expect(toJSON()).toMatchSnapshot();
  });
});
```

**Commit Message Template:**
```
feat(components): add MonoText component for financial data

- Create reusable monospaced text component
- Support positive/negative color variants
- Add price/percentage/volume variants
- Include comprehensive tests
```

**Estimated Tokens:** ~12,000

---

### Task 6: Create Skeleton Component

**Goal:** Build reusable skeleton loader component for loading states

**Files to Modify/Create:**
- `src/components/common/Skeleton.tsx` - NEW component
- `src/components/common/index.ts` - Add export

**Prerequisites:**
- Task 5 complete
- Understand ADR-005 (Loading States) and Pattern 3 (Skeleton Pattern) from Phase 0

**Implementation Steps:**
1. Create `Skeleton.tsx` component that renders a placeholder box
2. Use `theme.colors.surfaceVariant` for background color
3. Support props: `width`, `height`, `borderRadius`, `style`
4. Keep it simple - no shimmer/pulse animations
5. Export from index.ts

**Component Interface:**
```typescript
interface SkeletonProps extends ViewProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
}
```

**Implementation Guidance:**
- Default width: '100%'
- Default height: 20
- Default borderRadius: 4 (matches theme.borderRadius.sm)
- Use theme.colors.surfaceVariant for professional look
- Allow style overrides via style prop

**Verification Checklist:**
- [ ] Component renders as gray box
- [ ] Width/height props work correctly
- [ ] BorderRadius customizable
- [ ] Uses theme color (surfaceVariant)
- [ ] Style prop merges correctly
- [ ] Exported from common/index.ts

**Testing Instructions:**
```typescript
// src/components/common/__tests__/Skeleton.test.tsx
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { Skeleton } from '../Skeleton';
import { theme } from '@/theme';

describe('Skeleton', () => {
  const wrapper = ({ children }) => (
    <PaperProvider theme={theme}>{children}</PaperProvider>
  );

  it('renders with default dimensions', () => {
    const { UNSAFE_getByType } = render(<Skeleton />, { wrapper });
    const view = UNSAFE_getByType('View');
    expect(view.props.style).toEqual(
      expect.objectContaining({
        width: '100%',
        height: 20,
        borderRadius: 4,
      })
    );
  });

  it('accepts custom width and height', () => {
    const { UNSAFE_getByType } = render(<Skeleton width={200} height={40} />, { wrapper });
    const view = UNSAFE_getByType('View');
    expect(view.props.style).toEqual(
      expect.objectContaining({
        width: 200,
        height: 40,
      })
    );
  });

  it('uses theme surfaceVariant color', () => {
    const { UNSAFE_getByType } = render(<Skeleton />, { wrapper });
    const view = UNSAFE_getByType('View');
    expect(view.props.style.backgroundColor).toBe(theme.colors.surfaceVariant);
  });
});
```

**Commit Message Template:**
```
feat(components): add Skeleton loader component

- Create simple skeleton box component
- Use theme surfaceVariant color
- Support customizable width, height, borderRadius
- Add unit tests
```

**Estimated Tokens:** ~10,000

---

### Task 7: Update Root Layout with Dark Theme

**Goal:** Ensure dark theme applies globally from app root

**Files to Modify/Create:**
- `app/_layout.tsx` - Verify dark theme usage

**Prerequisites:**
- Tasks 1-6 complete
- Dark theme already imported and used

**Implementation Steps:**
1. Read `app/_layout.tsx` to verify PaperProvider wraps app
2. Confirm it imports and uses the theme from `src/theme/theme`
3. Update StatusBar style to 'light' for dark theme
4. Update loading container background to match dark theme
5. Test that theme is applied globally

**Verification Checklist:**
- [ ] PaperProvider wraps entire app
- [ ] Theme imported from src/theme/theme (dark theme)
- [ ] StatusBar style is 'light' (light text on dark background)
- [ ] Loading container uses dark background color
- [ ] No errors when app starts

**Testing Instructions:**
Manual testing:
1. Start app: `npm run web`
2. Verify loading screen has dark background
3. Verify status bar has light text (if visible)
4. Navigate through app and confirm dark theme everywhere

**Commit Message Template:**
```
style(theme): apply dark theme globally in root layout

- Verify PaperProvider uses dark theme
- Update StatusBar to light style
- Set loading container to dark background
```

**Estimated Tokens:** ~5,000

---

### Task 8: Update Common Components for Dark Theme

**Goal:** Audit and update existing common components to work properly with dark theme

**Files to Modify/Create:**
- `src/components/common/LoadingIndicator.tsx` - Update spinner color
- `src/components/common/ErrorDisplay.tsx` - Update text colors
- `src/components/common/EmptyState.tsx` - Update icon and text colors
- `src/components/common/OfflineIndicator.tsx` - Update banner colors

**Prerequisites:**
- Task 7 complete
- All common components should use useTheme() hook

**Implementation Steps:**
1. Read each common component file
2. Replace any hardcoded colors with theme colors via useTheme()
3. Ensure text uses theme.colors.onSurface or appropriate contrast color
4. Update ActivityIndicator color to theme.colors.primary
5. Verify icons use theme colors
6. Test each component renders correctly on dark background

**Specific Updates Needed:**

**LoadingIndicator:**
- ActivityIndicator color should use `theme.colors.primary`
- Text should use `theme.colors.onBackground`

**ErrorDisplay:**
- Error icon color should use `theme.colors.error`
- Text should use `theme.colors.onSurface`
- Retry button should use theme colors

**EmptyState:**
- Icon color should use `theme.colors.onSurfaceVariant`
- Text should use `theme.colors.onSurface`

**OfflineIndicator:**
- Banner background should use `theme.colors.errorContainer`
- Text should use `theme.colors.onErrorContainer`

**Verification Checklist:**
- [ ] No hardcoded color values (search for #FFFFFF, #000000, etc.)
- [ ] All components use useTheme() hook
- [ ] Text is readable on dark backgrounds
- [ ] Icons are visible
- [ ] Components tested manually in dark theme

**Testing Instructions:**
Update existing component tests to render with dark theme:

```typescript
// Example for LoadingIndicator test
describe('LoadingIndicator', () => {
  it('uses theme primary color for spinner', () => {
    const { UNSAFE_getByType } = render(<LoadingIndicator />, {
      wrapper: ({ children }) => (
        <PaperProvider theme={theme}>
          {children}
        </PaperProvider>
      )
    });
    const spinner = UNSAFE_getByType('ActivityIndicator');
    expect(spinner.props.color).toBe(theme.colors.primary);
  });
});
```

**Commit Message Template:**
```
style(components): update common components for dark theme

- Replace hardcoded colors with theme colors
- Ensure text contrast on dark backgrounds
- Update spinner and icon colors
- Verify all components use useTheme() hook
```

**Estimated Tokens:** ~15,000

---

### Task 9: Create Number Formatting Utilities

**Goal:** Build utility functions for consistent financial number formatting

**Files to Modify/Create:**
- `src/utils/formatting/numberFormatting.ts` - NEW utility file
- `src/utils/formatting/index.ts` - NEW index export

**Prerequisites:**
- Task 5 complete (MonoText component ready to use formatted numbers)
- Understand Pitfall 2 (Inconsistent Number Formatting) from Phase 0

**Implementation Steps:**
1. Create `src/utils/formatting/` directory
2. Create `numberFormatting.ts` with formatting functions
3. Implement formatters for: price, percentage, volume, large numbers
4. Add optional parameters for decimal places
5. Handle edge cases (null, undefined, negative numbers)
6. Create index.ts to export utilities

**Functions to Implement:**

```typescript
export function formatPrice(price: number | null | undefined, decimals = 2): string
export function formatPercentage(percent: number | null | undefined, decimals = 2): string
export function formatVolume(volume: number | null | undefined): string
export function formatLargeNumber(num: number | null | undefined): string
```

**Examples:**
- `formatPrice(123.456)` � `"$123.46"`
- `formatPercentage(5.234)` � `"+5.23%"`
- `formatPercentage(-3.1)` � `"-3.10%"`
- `formatVolume(1234567)` � `"1.23M"`
- `formatLargeNumber(1000000)` � `"1.00M"`

**Implementation Guidance:**
- Handle null/undefined by returning '-' or 'N/A'
- Always show sign (+/-) for percentages
- Use K/M/B suffixes for large numbers
- Keep consistent decimal places

**Verification Checklist:**
- [ ] All four formatters implemented
- [ ] Edge cases handled (null, undefined, 0, negative)
- [ ] Sign prefix added to percentages
- [ ] Large numbers abbreviated with K/M/B
- [ ] Exported from formatting/index.ts

**Testing Instructions:**
```typescript
// src/utils/formatting/__tests__/numberFormatting.test.ts
import {
  formatPrice,
  formatPercentage,
  formatVolume,
  formatLargeNumber
} from '../numberFormatting';

describe('Number Formatting Utilities', () => {
  describe('formatPrice', () => {
    it('formats positive price with $ and 2 decimals', () => {
      expect(formatPrice(123.456)).toBe('$123.46');
    });

    it('handles null/undefined', () => {
      expect(formatPrice(null)).toBe('N/A');
      expect(formatPrice(undefined)).toBe('N/A');
    });

    it('formats zero correctly', () => {
      expect(formatPrice(0)).toBe('$0.00');
    });
  });

  describe('formatPercentage', () => {
    it('formats positive percentage with + prefix', () => {
      expect(formatPercentage(5.234)).toBe('+5.23%');
    });

    it('formats negative percentage with - prefix', () => {
      expect(formatPercentage(-3.1)).toBe('-3.10%');
    });

    it('handles zero', () => {
      expect(formatPercentage(0)).toBe('+0.00%');
    });
  });

  describe('formatVolume', () => {
    it('abbreviates millions', () => {
      expect(formatVolume(1234567)).toBe('1.23M');
    });

    it('abbreviates thousands', () => {
      expect(formatVolume(12345)).toBe('12.35K');
    });

    it('handles small numbers', () => {
      expect(formatVolume(123)).toBe('123');
    });
  });

  describe('formatLargeNumber', () => {
    it('abbreviates billions', () => {
      expect(formatLargeNumber(1234567890)).toBe('1.23B');
    });

    it('abbreviates millions', () => {
      expect(formatLargeNumber(1234567)).toBe('1.23M');
    });
  });
});
```

**Commit Message Template:**
```
feat(utils): add financial number formatting utilities

- Add formatPrice with $ prefix and 2 decimals
- Add formatPercentage with +/- prefix
- Add formatVolume with K/M/B abbreviations
- Add formatLargeNumber for compact display
- Include comprehensive test coverage
```

**Estimated Tokens:** ~12,000

---

### Task 10: Update Existing Components to Use MonoText

**Goal:** Replace numeric displays in portfolio and search with MonoText component

**Files to Modify/Create:**
- `src/components/portfolio/PortfolioItem.tsx` - Update price display
- `src/components/stock/PriceListItem.tsx` - Update price display
- `src/components/stock/StockMetadataCard.tsx` - Update numeric fields

**Prerequisites:**
- Tasks 5 and 9 complete (MonoText and formatting utilities available)

**Implementation Steps:**
1. Read each component file to identify numeric displays
2. Import MonoText and formatting utilities
3. Replace Text components containing numbers with MonoText
4. Apply formatting utilities to raw numbers
5. Set positive/negative props based on data (e.g., change > 0)
6. Verify layout doesn't break with new component

**Example Transformation:**
```typescript
// Before
<Text>${price}</Text>
<Text>{change}%</Text>

// After
import { MonoText } from '@/components/common';
import { formatPrice, formatPercentage } from '@/utils/formatting';

<MonoText variant="price">
  {formatPrice(price)}
</MonoText>
<MonoText variant="percentage" positive={change > 0} negative={change < 0}>
  {formatPercentage(change)}
</MonoText>
```

**Verification Checklist:**
- [ ] All numeric displays use MonoText
- [ ] Formatting utilities applied consistently
- [ ] Positive/negative colors show correctly
- [ ] Layout unchanged (no spacing issues)
- [ ] Snapshot tests updated if needed

**Testing Instructions:**
Update component tests to verify MonoText usage:

```typescript
describe('PortfolioItem', () => {
  it('displays price with monospaced font', () => {
    const { getByText } = render(<PortfolioItem item={mockItem} />);
    const price = getByText(/\$123\.45/);
    expect(price.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: expect.stringMatching(/mono/i) })
      ])
    );
  });

  it('shows positive change in green', () => {
    const item = { ...mockItem, change: 5.2 };
    const { getByText } = render(<PortfolioItem item={item} />);
    const change = getByText(/\+5\.20%/);
    expect(change.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: theme.colors.positive })
      ])
    );
  });
});
```

**Commit Message Template:**
```
refactor(components): use MonoText for all financial numbers

- Update PortfolioItem to use MonoText for price/change
- Update PriceListItem to use MonoText
- Update StockMetadataCard numeric fields
- Apply formatting utilities consistently
- Ensure positive/negative colors applied
```

**Estimated Tokens:** ~16,000

---

## Phase Verification

Before proceeding to Phase 2, verify all tasks complete:

### Automated Verification

Run all tests:
```bash
npm test
npm run type-check
```

All tests should pass with no TypeScript errors.

### Visual Verification

Start the app in web mode:
```bash
npm run web
```

**Checklist:**
- [ ] App displays with dark theme (#121212 background visible)
- [ ] Text is readable (white/light gray on dark background)
- [ ] Loading screen has dark background
- [ ] Portfolio screen shows dark theme
- [ ] Numeric data uses monospaced font (visually distinct from other text)
- [ ] Green color used for positive changes
- [ ] Red color used for negative changes
- [ ] No visual regressions (layout still intact)

### Manual Testing Flows

1. **Navigate through app:**
   - Search screen � dark background 
   - Portfolio screen � dark cards 
   - Stock detail � dark theme 
   - News tab � dark theme 

2. **Check numbers:**
   - Portfolio prices � monospaced 
   - Percentage changes � monospaced with colors 
   - Stock detail prices � monospaced 

3. **Loading states:**
   - Initial app load � dark loading screen 
   - Data loading � verify no white flashes 

### Known Issues / Technical Debt

Document any issues encountered:

- _List any workarounds or temporary solutions_
- _Note any components not yet updated (will be addressed in Phase 2)_
- _Performance concerns if any_

---

## Integration Points

Phase 1 provides the foundation for:

- **Phase 2**: List views will use MonoText and dark theme colors
- **Phase 3**: Charts will use theme colors for consistency
- **Phase 4**: Skeleton component will be used extensively
- **Phase 5**: Web optimizations will build on dark theme

**Critical Exports from Phase 1:**
- `MonoText` component for all numeric displays
- `Skeleton` component for loading states
- Number formatting utilities
- Dark theme applied globally

---

**Phase 1 Complete!**

Verify all tasks complete and tests pass before proceeding to **[Phase 2: List Views Modernization](./Phase-2.md)**.
