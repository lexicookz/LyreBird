// theme/ThemeContext.tsx
// Which palette is showing. "system" (the default) follows the phone's
// light/dark setting; Settings can pin it to light or dark. The choice is
// remembered on the device.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, darkColors, lightColors, stagesFor } from './palette';

export type Appearance = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lyrebird.appearance';

type Theme = {
  colors: Colors;
  /** The palette actually showing. */
  scheme: 'light' | 'dark';
  /** What the user picked. */
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  /** Funnel stage labels with this palette's colours. */
  stages: ReturnType<typeof stagesFor>;
};

const lightTheme: Theme = {
  colors: lightColors,
  scheme: 'light',
  appearance: 'system',
  setAppearance: () => {},
  stages: stagesFor(lightColors),
};

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setAppearanceState(saved);
      })
      .catch(() => {});
  }, []);

  const theme = useMemo<Theme>(() => {
    const scheme = appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
    const colors = scheme === 'dark' ? darkColors : lightColors;
    return {
      colors,
      scheme,
      appearance,
      setAppearance: (next) => {
        setAppearanceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
      stages: stagesFor(colors),
    };
  }, [appearance, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Styles built from the current palette. Define them once per file as
 * `const makeStyles = (colors: Colors) => StyleSheet.create({...})` and call
 * `const styles = useStyles(makeStyles)` in each component that uses them.
 */
export function useStyles<T>(factory: (colors: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
