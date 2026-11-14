import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Radius, Spacing, Typography } from '../../theme';
import {
  BdmLogoMark,
  DownloadIcon,
  SettingsIcon,
} from '../Icons/BdmIcons';

interface AppHeaderProps {
  onDownloadsPress: () => void;
  onSettingsPress: () => void;
  activeDownloadsCount?: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onDownloadsPress,
  onSettingsPress,
  activeDownloadsCount = 0,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <BdmLogoMark size={40} />
        <View style={styles.brandTextWrap}>
          <View style={styles.titleRow}>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>
              BDM
            </Text>
            <View
              style={[
                styles.versionPill,
                { backgroundColor: colors.primarySoft },
              ]}>
              <Text style={[styles.versionText, { color: colors.primary }]}>
                BROWSER
              </Text>
            </View>
          </View>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Best Download Manager
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open Download History"
          activeOpacity={0.8}
          onPress={onDownloadsPress}
          style={[
            styles.iconButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <DownloadIcon size={20} color={colors.textPrimary} />
          {activeDownloadsCount > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.primary },
              ]}>
              <Text style={styles.badgeText}>{activeDownloadsCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          activeOpacity={0.8}
          onPress={onSettingsPress}
          style={[
            styles.iconButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <SettingsIcon size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandTextWrap: {
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  appName: {
    ...Typography.h1,
    letterSpacing: -0.5,
  },
  versionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  versionText: {
    ...Typography.label,
    fontSize: 10,
  },
  tagline: {
    ...Typography.caption,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
