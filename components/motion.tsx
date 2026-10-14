// components/motion.tsx
// The few pieces of movement the app uses, so it feels like one app:
//   <Appear>          fades (and slides) its content in when it mounts
//   <ScalePressable>  a Pressable that dips slightly while held
// Both are skipped when the phone's "Reduce Motion" setting is on.
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

/** True when the user has asked their phone for less motion. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => active && setReduce(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

const OFFSETS = { right: { x: 28, y: 0 }, bottom: { x: 0, y: 16 }, top: { x: 0, y: -12 }, none: { x: 0, y: 0 } };

/**
 * Fades its children in on mount, sliding from `from`. Give it a `key` that
 * changes with the screen so each new screen animates in.
 */
export function Appear({
  from = 'none',
  duration = 220,
  style,
  children,
  ...viewProps
}: Omit<ViewProps, 'style'> & {
  from?: keyof typeof OFFSETS;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduce ? 0 : duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, duration, reduce]);

  const { x, y } = OFFSETS[from];
  return (
    <Animated.View
      {...viewProps}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : x, 0] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : y, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that scales down a touch while held, so a tap visibly lands.
 * Takes the same props as Pressable; `style` may be a function of `pressed`.
 * Don't put a `transform` in its style -- the scale replaces it.
 */
export function ScalePressable({
  style,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableProps & { pressedScale?: number }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const to = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  // Animated components take a plain style, so resolve a style function here.
  const resolved =
    typeof style === 'function'
      ? style({ pressed, hovered: false } as Parameters<Exclude<PressableProps['style'], StyleProp<ViewStyle>>>[0])
      : style;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduce) to(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (!reduce) to(1);
        onPressOut?.(e);
      }}
      style={[resolved, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
