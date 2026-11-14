import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Original BDM – Best Download Manager Brand Mark
 * Features a sleek rounded hexagon/squircle badge with a dynamic download arrow & media play accent.
 */
export const BdmLogoMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Defs>
      <LinearGradient id="bdmBrandGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <Stop offset="0%" stopColor="#6C5CE7" />
        <Stop offset="100%" stopColor="#4F46E5" />
      </LinearGradient>
    </Defs>
    <Rect x="2" y="2" width="44" height="44" rx="14" fill="url(#bdmBrandGrad)" />
    <Path
      d="M24 12V28M24 28L17.5 21.5M24 28L30.5 21.5"
      stroke="#FFFFFF"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M15 34.5H33"
      stroke="#FFFFFF"
      strokeWidth="3.4"
      strokeLinecap="round"
    />
    <Circle cx="35.5" cy="12.5" r="3" fill="#A5B4FC" />
  </Svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 20, color = '#71717A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2.2" />
    <Path d="M20 20L16.35 16.35" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ size = 20, color = '#6C5CE7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M3.6 9H20.4M3.6 15H20.4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Path
      d="M12 3C14.5 5.6 15.8 8.7 15.8 12C15.8 15.3 14.5 18.4 12 21C9.5 18.4 8.2 15.3 8.2 12C8.2 8.7 9.5 5.6 12 3Z"
      stroke={color}
      strokeWidth="1.8"
    />
  </Svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ size = 20, color = '#18181B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 4V15.5M12 15.5L7.5 11M12 15.5L16.5 11"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M5 19.5H19"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </Svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 20, color = '#18181B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth="2" />
    <Path
      d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L19.79 16.88A2 2 0 1 1 16.96 19.71L16.9 19.65A1.65 1.65 0 0 0 15.08 19.32A1.65 1.65 0 0 0 14 20.85V21A2 2 0 1 1 10 21V20.91A1.65 1.65 0 0 0 8.92 19.38A1.65 1.65 0 0 0 7.1 19.71L7.04 19.77A2 2 0 1 1 4.21 16.94L4.27 16.88A1.65 1.65 0 0 0 4.6 15.06A1.65 1.65 0 0 0 3.09 14H3A2 2 0 1 1 3 10H3.09A1.65 1.65 0 0 0 4.6 8.92A1.65 1.65 0 0 0 4.27 7.1L4.21 7.04A2 2 0 1 1 7.04 4.21L7.1 4.27A1.65 1.65 0 0 0 8.92 4.6H9A1.65 1.65 0 0 0 10 3.09V3A2 2 0 1 1 14 3V3.09A1.65 1.65 0 0 0 15 4.6A1.65 1.65 0 0 0 16.82 4.27L16.88 4.21A2 2 0 1 1 19.71 7.04L19.65 7.1A1.65 1.65 0 0 0 19.32 8.92V9A1.65 1.65 0 0 0 20.85 10H21A2 2 0 1 1 21 14H20.91A1.65 1.65 0 0 0 19.4 15Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const HomeIcon: React.FC<IconProps> = ({ size = 20, color = '#18181B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 10.5L12 3L21 10.5V19.5C21 20.3284 20.3284 21 19.5 21H4.5C3.67157 21 3 20.3284 3 19.5V10.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M9 21V13.5H15V21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ArrowRightIcon: React.FC<IconProps> = ({ size = 18, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12H19M19 12L13 6M19 12L13 18"
      stroke={color}
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 18, color = '#71717A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M18 6L6 18M6 6L18 18"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const HistoryIcon: React.FC<IconProps> = ({ size = 18, color = '#71717A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2" />
    <Path d="M12 7.5V12L15 14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const VideoIcon: React.FC<IconProps> = ({ size = 18, color = '#6C5CE7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2.5" y="5.5" width="14" height="13" rx="3" stroke={color} strokeWidth="2" />
    <Path
      d="M16.5 10.2L21.5 7.5V16.5L16.5 13.8V10.2Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ShieldIcon: React.FC<IconProps> = ({ size = 16, color = '#10B981' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2.5L4.5 5.8V11.4C4.5 16.4 7.7 20.9 12 22.3C16.3 20.9 19.5 16.4 19.5 11.4V5.8L12 2.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9 12.2L11.1 14.3L15.4 10"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
