/**
 * Success Feedback Component
 * Shows animated checkmark for successful actions
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';

interface SuccessFeedbackProps {
  message?: string;
  visible: boolean;
  onComplete?: () => void;
}

export function SuccessFeedback({ message, visible, onComplete }: SuccessFeedbackProps) {
  const theme = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Auto-hide after 2 seconds
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onComplete?.();
          });
        }, 2000);
      });
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim, onComplete]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.surface,
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
        </View>
        {message && (
          <Text style={[styles.message, { color: theme.colors.onSurface }]}>{message}</Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  container: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
  },
  iconContainer: {
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
