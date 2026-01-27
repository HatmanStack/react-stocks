/**
 * GlowingCard Component
 *
 * Enhanced card with pointer-following edge glow effect
 * Inspired by simeydotme's "Colored, Glowing Edge Card" CodePen
 *
 * Uses react-native-reanimated for smooth glow tracking
 * and expo-linear-gradient for the glow effect
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, LayoutChangeEvent } from 'react-native';
import { Card, CardProps } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};

// Glow intensity and size
const GLOW_RADIUS = 120;
const GLOW_OPACITY_MAX = 0.35;

export interface GlowingCardProps extends Omit<CardProps, 'onPress'> {
  onPress?: () => void;
  children: React.ReactNode;
  /** Glow color - defaults to theme primary */
  glowColor?: string;
  /** Disable the glow effect */
  disableGlow?: boolean;
  /** Glow intensity multiplier (0-2, default 1) */
  glowIntensity?: number;
}

/**
 * GlowingCard provides:
 * - Pointer-following edge glow that tracks mouse/touch position
 * - Press feedback animation (scale 0.98)
 * - Web hover states with enhanced glow
 * - Keyboard focus indicator
 */
export function GlowingCard({
  onPress,
  children,
  style,
  glowColor,
  disableGlow = false,
  glowIntensity = 1,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  ...cardProps
}: GlowingCardProps) {
  const theme = useAppTheme();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Animation values
  const scale = useSharedValue(1);
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const isHovering = useSharedValue(0);
  const isPressed = useSharedValue(0);

  const effectiveGlowColor = glowColor || theme.colors.primary;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setDimensions({ width, height });
  }, []);

  // Pan gesture for tracking pointer position
  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      pointerX.value = e.x;
      pointerY.value = e.y;
      isHovering.value = withSpring(1, SPRING_CONFIG);
    })
    .onUpdate((e) => {
      pointerX.value = e.x;
      pointerY.value = e.y;
    })
    .onFinalize(() => {
      isHovering.value = withSpring(0, SPRING_CONFIG);
    });

  // Tap gesture for press feedback
  const tapGesture = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(0.97, SPRING_CONFIG);
      isPressed.value = withSpring(1, SPRING_CONFIG);
    })
    .onFinalize(() => {
      scale.value = withSpring(1, SPRING_CONFIG);
      isPressed.value = withSpring(0, SPRING_CONFIG);
    })
    .onEnd(() => {
      onPress?.();
    });

  // Hover gesture for web
  const hoverGesture = Gesture.Hover()
    .onBegin((e) => {
      pointerX.value = e.x;
      pointerY.value = e.y;
      isHovering.value = withSpring(1, SPRING_CONFIG);
    })
    .onUpdate((e) => {
      pointerX.value = e.x;
      pointerY.value = e.y;
    })
    .onEnd(() => {
      isHovering.value = withSpring(0, SPRING_CONFIG);
    });

  const composedGesture = Gesture.Simultaneous(
    panGesture,
    tapGesture,
    Platform.OS === 'web' ? hoverGesture : Gesture.Manual()
  );

  // Card scale and shadow animation
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: interpolate(isPressed.value, [0, 1], [0.2, 0.4]),
    shadowRadius: interpolate(isPressed.value, [0, 1], [4, 8]),
  }));

  // Glow position and opacity animation
  const glowAnimatedStyle = useAnimatedStyle(() => {
    if (disableGlow) {
      return { opacity: 0 };
    }

    const opacity = interpolate(
      isHovering.value,
      [0, 1],
      [0, GLOW_OPACITY_MAX * glowIntensity],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [
        { translateX: pointerX.value - GLOW_RADIUS },
        { translateY: pointerY.value - GLOW_RADIUS },
      ],
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        // @ts-ignore - Reanimated style types conflict with RN style types
        style={[cardAnimatedStyle, style]}
        onLayout={handleLayout}
        accessible={true}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityRole={accessibilityRole || 'button'}
      >
        {/* Glow layer */}
        {!disableGlow && dimensions.width > 0 && (
          <Animated.View
            style={[
              styles.glowContainer,
              glowAnimatedStyle,
              {
                width: GLOW_RADIUS * 2,
                height: GLOW_RADIUS * 2,
              },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.glowInner,
                {
                  backgroundColor: effectiveGlowColor,
                  width: GLOW_RADIUS * 2,
                  height: GLOW_RADIUS * 2,
                  borderRadius: GLOW_RADIUS,
                },
              ]}
            />
          </Animated.View>
        )}

        {/* Card content */}
        {/* @ts-expect-error - react-native-paper Card types overly restrictive */}
        <Card
          {...cardProps}
          style={[styles.card, { overflow: 'hidden' }]}
        >
          {children}
        </Card>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
  },
  glowContainer: {
    position: 'absolute',
    zIndex: 1,
    pointerEvents: 'none',
  },
  glowInner: {
    // Blur effect via shadow on iOS, filter on web
    ...Platform.select({
      ios: {
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 40,
      },
      android: {
        elevation: 0,
      },
      web: {
        filter: 'blur(40px)',
      } as unknown as object,
    }),
  },
});
