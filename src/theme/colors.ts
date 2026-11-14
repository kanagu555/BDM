export const BrandPalette = {
  primary: '#6C5CE7',
  secondary: '#4F46E5',
  primarySoftLight: '#EEF2FF',
  primarySoftDark: '#232042',
  lightBackground: '#F8F9FC',
  darkBackground: '#111318',
  lightSurface: '#FFFFFF',
  darkSurface: '#1B1D24',
  lightSurfaceElevated: '#F1F3F9',
  darkSurfaceElevated: '#242731',
  textPrimaryLight: '#18181B',
  textSecondaryLight: '#71717A',
  textPrimaryDark: '#F4F4F5',
  textSecondaryDark: '#A1A1AA',
  borderLight: '#E4E6EF',
  borderDark: '#2A2D3A',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
} as const;

export interface ThemeColors {
  isDark: boolean;
  primary: string;
  secondary: string;
  primarySoft: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  statusBarStyle: 'light-content' | 'dark-content';
}

export const LightThemeColors: ThemeColors = {
  isDark: false,
  primary: BrandPalette.primary,
  secondary: BrandPalette.secondary,
  primarySoft: BrandPalette.primarySoftLight,
  background: BrandPalette.lightBackground,
  surface: BrandPalette.lightSurface,
  surfaceElevated: BrandPalette.lightSurfaceElevated,
  textPrimary: BrandPalette.textPrimaryLight,
  textSecondary: BrandPalette.textSecondaryLight,
  border: BrandPalette.borderLight,
  success: BrandPalette.success,
  warning: BrandPalette.warning,
  error: BrandPalette.error,
  statusBarStyle: 'dark-content',
};

export const DarkThemeColors: ThemeColors = {
  isDark: true,
  primary: BrandPalette.primary,
  secondary: BrandPalette.secondary,
  primarySoft: BrandPalette.primarySoftDark,
  background: BrandPalette.darkBackground,
  surface: BrandPalette.darkSurface,
  surfaceElevated: BrandPalette.darkSurfaceElevated,
  textPrimary: BrandPalette.textPrimaryDark,
  textSecondary: BrandPalette.textSecondaryDark,
  border: BrandPalette.borderDark,
  success: BrandPalette.success,
  warning: BrandPalette.warning,
  error: BrandPalette.error,
  statusBarStyle: 'light-content',
};
