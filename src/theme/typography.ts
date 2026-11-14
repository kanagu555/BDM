import { TextStyle } from 'react-native';

export const Typography: Record<string, TextStyle> = {
  display: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
};
