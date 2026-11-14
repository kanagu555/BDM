import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../store/useAppStore';
import { Radius, Spacing, Typography } from '../../theme';
import { ThemeMode } from '../../types';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export const SettingsScreen: React.FC = () => {
  const { colors, themeMode, setThemeMode } = useAppTheme();
  const clearBrowserSessionData = useAppStore(
    (state) => state.clearBrowserSessionData,
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Settings
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          BDM – Best Download Manager Preferences
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          Appearance Theme
        </Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => {
            const active = themeMode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                activeOpacity={0.8}
                onPress={() => setThemeMode(opt.value)}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: active
                      ? colors.primary
                      : colors.surfaceElevated,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.themeChipText,
                    { color: active ? '#FFFFFF' : colors.textPrimary },
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          Download Location
        </Text>
        <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
          Internal Storage / Downloads / BDM
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Browsing History
            </Text>
            <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
              Clear recently visited websites
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={clearBrowserSessionData}
            style={[
              styles.clearBtn,
              { backgroundColor: colors.primarySoft },
            ]}>
            <Text style={[styles.clearBtnText, { color: colors.primary }]}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          About BDM
        </Text>
        <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
          BDM - Browser & Download Manager • Version 1.0.0 (MVP Phase 6)
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    paddingTop: Spacing.md,
    gap: 2,
  },
  title: {
    ...Typography.h1,
  },
  subtitle: {
    ...Typography.caption,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {
    ...Typography.subtitle,
  },
  themeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  themeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  themeChipText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  infoValue: {
    ...Typography.body,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  clearBtnText: {
    ...Typography.caption,
    fontWeight: '700',
  },
});
