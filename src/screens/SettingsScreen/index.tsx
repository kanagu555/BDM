import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BdmLogoMark,
  CheckCircleIcon,
  DesktopIcon,
  FolderIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  TrashIcon,
} from '../../components/Icons/BdmIcons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../store/useAppStore';
import { Radius, Spacing, Typography } from '../../theme';
import { ThemeMode } from '../../types';

const THEME_OPTIONS: {
  label: string;
  subtitle: string;
  value: ThemeMode;
}[] = [
    {
      label: 'System',
      subtitle: 'Follow device setting',
      value: 'system',
    },
    {
      label: 'Light',
      subtitle: 'Clean light surface',
      value: 'light',
    },
    {
      label: 'Dark',
      subtitle: 'OLED-friendly dark',
      value: 'dark',
    },
  ];

export const SettingsScreen: React.FC = () => {
  const { colors, isDark, themeMode, setThemeMode } = useAppTheme();
  const recentSites = useAppStore((state) => state.recentSites);
  const downloads = useAppStore((state) => state.downloads);
  const clearBrowserSessionData = useAppStore(
    (state) => state.clearBrowserSessionData,
  );

  const [isClearConfirmVisible, setIsClearConfirmVisible] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const completedCount = downloads.filter(
    (d) => d.status === 'completed',
  ).length;

  const handleConfirmClearBrowserData = () => {
    setIsClearConfirmVisible(false);
    clearBrowserSessionData();
    setStatusNotice('Browser history and WebView session data cleared.');
    setTimeout(() => {
      setStatusNotice(null);
    }, 3500);
  };

  const renderThemeIcon = (mode: ThemeMode, active: boolean) => {
    const iconColor = active ? '#FFFFFF' : colors.primary;
    if (mode === 'light') {
      return <SunIcon size={18} color={iconColor} />;
    }
    if (mode === 'dark') {
      return <MoonIcon size={18} color={iconColor} />;
    }
    return <DesktopIcon size={18} color={iconColor} />;
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Settings
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Theme, storage location, privacy, and application details
          </Text>
        </View>

        {/* Feedback Banner */}
        {statusNotice ? (
          <View
            style={[
              styles.noticeBanner,
              {
                backgroundColor: colors.primarySoft,
                borderColor: colors.border,
              },
            ]}>
            <CheckCircleIcon size={16} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
              {statusNotice}
            </Text>
          </View>
        ) : null}

        {/* 1. Theme Section: System / Light / Dark */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Appearance Theme
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Active mode: {themeMode.toUpperCase()} (
                {isDark ? 'Dark palette' : 'Light palette'})
              </Text>
            </View>
          </View>

          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = themeMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${opt.label} theme`}
                  activeOpacity={0.82}
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
                  {renderThemeIcon(opt.value, active)}
                  <Text
                    style={[
                      styles.themeChipTitle,
                      { color: active ? '#FFFFFF' : colors.textPrimary },
                    ]}>
                    {opt.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.themeChipSub,
                      {
                        color: active
                          ? 'rgba(255,255,255,0.82)'
                          : colors.textSecondary,
                      },
                    ]}>
                    {opt.subtitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Download Location Information */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <View style={styles.iconRowCard}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: colors.primarySoft },
              ]}>
              <FolderIcon size={20} color={colors.primary} />
            </View>
            <View style={styles.iconRowTextCol}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Download Location
              </Text>
              <Text
                style={[styles.pathText, { color: colors.primary }]}
                selectable>
                Internal Storage / Downloads / BDM
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Managed by Android DownloadManager • {completedCount} completed{' '}
                {completedCount === 1 ? 'file' : 'files'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Clear Browser Data */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <View style={styles.rowBetween}>
            <View style={styles.clearTextCol}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Clear Browser Data
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Clears {recentSites.length} recent history{' '}
                {recentSites.length === 1 ? 'entry' : 'entries'} and resets the
                active WebView session
              </Text>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear browser data"
              activeOpacity={0.82}
              onPress={() => setIsClearConfirmVisible(true)}
              style={[
                styles.clearBtn,
                {
                  backgroundColor: `${colors.error}16`,
                  borderColor: `${colors.error}40`,
                },
              ]}>
              <TrashIcon size={15} color={colors.error} />
              <Text style={[styles.clearBtnText, { color: colors.error }]}>
                Clear Data
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. About BDM & App Version */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <View style={styles.aboutTopRow}>
            <BdmLogoMark size={48} />
            <View style={styles.aboutBrandCol}>
              <Text style={[styles.aboutTitle, { color: colors.textPrimary }]}>
                BDM – Best Download Manager
              </Text>
              <Text
                style={[styles.aboutPlayTitle, { color: colors.primary }]}>
                BDM - Browser & Download Manager
              </Text>
              <Text
                style={[styles.aboutTagline, { color: colors.textSecondary }]}>
                Download Smarter. Browse Better.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: colors.border },
            ]}
          />

          <View style={styles.versionGrid}>
            <View style={styles.versionRow}>
              <Text
                style={[styles.versionLabel, { color: colors.textSecondary }]}>
                App Version
              </Text>
              <Text
                style={[styles.versionValue, { color: colors.textPrimary }]}>
                1.0.7 (Build 8)
              </Text>
            </View>

            <View style={styles.versionRow}>
              <Text
                style={[styles.versionLabel, { color: colors.textSecondary }]}>
                Supported Formats
              </Text>
              <Text
                style={[styles.versionValue, { color: colors.textPrimary }]}>
                Direct HTML5 MP4 & WebM
              </Text>
            </View>

            <View style={styles.versionRow}>
              <Text
                style={[styles.versionLabel, { color: colors.textSecondary }]}>
                Security & Privacy
              </Text>
              <View style={styles.privacyPill}>
                <ShieldIcon size={14} color={colors.success} />
                <Text
                  style={[styles.privacyText, { color: colors.success }]}>
                  SSL Verified • No Tracking or Ads
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Clear Browser Data Confirmation Modal */}
      <Modal
        visible={isClearConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsClearConfirmVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsClearConfirmVisible(false)}>
          <Pressable
            style={[
              styles.confirmDialog,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.confirmIconCircle,
                { backgroundColor: `${colors.error}18` },
              ]}>
              <TrashIcon size={22} color={colors.error} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              Clear Browser Data?
            </Text>
            <Text
              style={[
                styles.confirmSubtitle,
                { color: colors.textSecondary },
              ]}>
              This will clear your recently visited websites and reset the
              active in-app browser session. Downloaded video files in
              Downloads/BDM will not be deleted.
            </Text>

            <View style={styles.confirmActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsClearConfirmVisible(false)}
                style={[
                  styles.confirmCancelBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.confirmCancelText,
                    { color: colors.textPrimary },
                  ]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleConfirmClearBrowserData}
                style={[
                  styles.confirmDeleteBtn,
                  { backgroundColor: colors.error },
                ]}>
                <Text style={styles.confirmDeleteText}>Clear Data</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  header: {
    gap: 2,
  },
  title: {
    ...Typography.h1,
  },
  subtitle: {
    ...Typography.caption,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  noticeText: {
    ...Typography.caption,
    fontWeight: '600',
    flex: 1,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...Typography.subtitle,
    fontSize: 15,
  },
  cardSubtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
  themeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  themeChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderWidth: 1.2,
    alignItems: 'center',
    gap: 4,
  },
  themeChipTitle: {
    ...Typography.subtitle,
    fontSize: 13,
    marginTop: 2,
  },
  themeChipSub: {
    fontSize: 10,
    textAlign: 'center',
  },
  iconRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRowTextCol: {
    flex: 1,
    gap: 2,
  },
  pathText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    fontSize: 13,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  clearTextCol: {
    flex: 1,
    gap: 2,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  clearBtnText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  aboutTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  aboutBrandCol: {
    flex: 1,
    gap: 2,
  },
  aboutTitle: {
    ...Typography.subtitle,
    fontSize: 15,
  },
  aboutPlayTitle: {
    ...Typography.caption,
    fontWeight: '700',
  },
  aboutTagline: {
    ...Typography.caption,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  versionGrid: {
    gap: Spacing.sm,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  versionLabel: {
    ...Typography.caption,
  },
  versionValue: {
    ...Typography.caption,
    fontWeight: '700',
  },
  privacyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  privacyText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  confirmIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  confirmTitle: {
    ...Typography.h2,
    textAlign: 'center',
  },
  confirmSubtitle: {
    ...Typography.body,
    textAlign: 'center',
    fontSize: 13,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    ...Typography.subtitle,
    color: '#FFFFFF',
    fontSize: 14,
  },
});
