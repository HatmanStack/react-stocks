import { renderHook } from '@testing-library/react-native';
import { useLayoutDensity } from '../useLayoutDensity';
import { useWindowDimensions } from 'react-native';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const mockUseWindowDimensions = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;

describe('useLayoutDensity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns dense layout for narrow screens (mobile)', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1,
    });

    const { result } = renderHook(() => useLayoutDensity());

    expect(result.current.isDense).toBe(true);
    expect(result.current.cardSpacing).toBe(6);
    expect(result.current.cardPadding).toBe(12);
    expect(result.current.fontSize.title).toBe(14);
    expect(result.current.fontSize.subtitle).toBe(12);
    expect(result.current.fontSize.caption).toBe(10);
  });

  it('returns dense layout for screens just below breakpoint', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 767,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });

    const { result } = renderHook(() => useLayoutDensity());

    expect(result.current.isDense).toBe(true);
    expect(result.current.cardSpacing).toBeLessThan(10);
  });

  it('returns spacious layout for wide screens (tablet/desktop)', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 1024,
      height: 768,
      scale: 1,
      fontScale: 1,
    });

    const { result } = renderHook(() => useLayoutDensity());

    expect(result.current.isDense).toBe(false);
    expect(result.current.cardSpacing).toBe(12);
    expect(result.current.cardPadding).toBe(16);
    expect(result.current.fontSize.title).toBe(16);
    expect(result.current.fontSize.subtitle).toBe(14);
    expect(result.current.fontSize.caption).toBe(12);
  });

  it('returns spacious layout for screens at breakpoint', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 768,
      height: 1024,
      scale: 1,
      fontScale: 1,
    });

    const { result } = renderHook(() => useLayoutDensity());

    expect(result.current.isDense).toBe(false);
    expect(result.current.cardSpacing).toBeGreaterThan(8);
  });

  it('returns spacious layout for large desktop screens', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 1920,
      height: 1080,
      scale: 1,
      fontScale: 1,
    });

    const { result } = renderHook(() => useLayoutDensity());

    expect(result.current.isDense).toBe(false);
    expect(result.current.cardSpacing).toBe(12);
    expect(result.current.cardPadding).toBe(16);
  });

  it('memoizes result when width does not change', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1,
    });

    const { result, rerender } = renderHook(() => useLayoutDensity());
    const firstResult = result.current;

    rerender();
    const secondResult = result.current;

    expect(firstResult).toBe(secondResult);
  });

  it('updates result when width changes', () => {
    mockUseWindowDimensions.mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1,
    });

    const { result, rerender } = renderHook(() => useLayoutDensity());
    expect(result.current.isDense).toBe(true);

    mockUseWindowDimensions.mockReturnValue({
      width: 1024,
      height: 768,
      scale: 1,
      fontScale: 1,
    });

    rerender();
    expect(result.current.isDense).toBe(false);
  });
});
