import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { DownloadIcon } from '../Icons/BdmIcons';

interface FloatingDownloadButtonProps {
  visible: boolean;
  count: number;
  onPress: () => void;
}

const FAB_SIZE = 58;

export const FloatingDownloadButton: React.FC<FloatingDownloadButtonProps> = ({
  visible,
  count,
  onPress,
}) => {
  const { colors } = useAppTheme();
  const [shouldRender, setShouldRender] = useState(visible);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.65)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastOffset = useRef({ x: 0, y: 0 });
  const onPressRef = useRef(onPress);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  // Smooth fade-in + spring scale entrance and exit animation
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 85,
          useNativeDriver: true,
        }),
      ]).start();

      // Subtle attention pulse when video is newly detected
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(pulseAnim, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.65,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShouldRender(false);
        }
      });
    }
  }, [visible, fadeAnim, scaleAnim, pulseAnim]);

  // Draggable PanResponder that distinguishes tap vs. drag and clamps to screen bounds
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        Animated.spring(pulseAnim, {
          toValue: 0.93,
          useNativeDriver: true,
          speed: 30,
        }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        const { width, height } = Dimensions.get('window');
        const minX = -(width - FAB_SIZE - 36);
        const maxX = 8;
        const minY = -(height - FAB_SIZE - 220);
        const maxY = 12;

        const nextX = Math.max(
          minX,
          Math.min(maxX, lastOffset.current.x + gestureState.dx),
        );
        const nextY = Math.max(
          minY,
          Math.min(maxY, lastOffset.current.y + gestureState.dy),
        );

        pan.setValue({ x: nextX, y: nextY });
      },
      onPanResponderRelease: (_, gestureState) => {
        Animated.spring(pulseAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 25,
        }).start();

        const isTap =
          Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6;

        if (isTap) {
          onPressRef.current();
          return;
        }

        const { width, height } = Dimensions.get('window');
        const minX = -(width - FAB_SIZE - 36);
        const maxX = 8;
        const minY = -(height - FAB_SIZE - 220);
        const maxY = 12;

        lastOffset.current = {
          x: Math.max(
            minX,
            Math.min(maxX, lastOffset.current.x + gestureState.dx),
          ),
          y: Math.max(
            minY,
            Math.min(maxY, lastOffset.current.y + gestureState.dy),
          ),
        };
      },
    }),
  ).current;

  if (!shouldRender) {
    return null;
  }

  const combinedScale = Animated.multiply(scaleAnim, pulseAnim);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={
        count > 1
          ? `Download ${count} detected videos`
          : 'Download detected video'
      }
      style={[
        styles.fabContainer,
        {
          opacity: fadeAnim,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: combinedScale },
          ],
        },
      ]}>
      <View
        style={[
          styles.fabOuterRing,
          { backgroundColor: `${colors.primary}26` },
        ]}>
        <View
          style={[
            styles.fabButton,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}>
          <DownloadIcon size={24} color="#FFFFFF" />
        </View>
      </View>

      {count > 1 ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: colors.secondary,
              borderColor: colors.surface,
            },
          ]}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOuterRing: {
    width: FAB_SIZE + 10,
    height: FAB_SIZE + 10,
    borderRadius: (FAB_SIZE + 10) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    elevation: 9,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
