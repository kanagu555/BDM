import { useColorScheme } from 'react-native';
import {
  DarkThemeColors,
  LightThemeColors,
  ThemeColors,
} from '../theme/colors';
import { useAppStore } from '../store/useAppStore';

export function useAppTheme(): {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: 'system' | 'light' | 'dark';
  setThemeMode: (mode: 'system' | 'light' | 'dark') => void;
} {
  const systemColorScheme = useColorScheme();
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  const isDark =
    themeMode === 'system'
      ? systemColorScheme === 'dark'
      : themeMode === 'dark';

  return {
    colors: isDark ? DarkThemeColors : LightThemeColors,
    isDark,
    themeMode,
    setThemeMode,
  };
}
