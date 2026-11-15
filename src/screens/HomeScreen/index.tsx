import React, { useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AddressBar } from '../../components/AddressBar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import {
  BdmLogoMark,
  DownloadIcon,
  GlobeIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  VideoIcon,
} from '../../components/Icons/BdmIcons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../store/useAppStore';
import { Radius, Spacing, Typography } from '../../theme';
import { QuickAccessSite, RootTabParamList } from '../../types';

type HomeNavProp = BottomTabNavigationProp<RootTabParamList, 'Home'>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeNavProp>();
  const { colors } = useAppTheme();

  const [addressInput, setAddressInput] = useState('');
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);

  const quickAccessSites = useAppStore((state) => state.quickAccessSites);
  const downloads = useAppStore((state) => state.downloads);
  const isAddressResolving = useAppStore((state) => state.isAddressResolving);
  const setIsAddressResolving = useAppStore(
    (state) => state.setIsAddressResolving,
  );
  const openAddressInput = useAppStore((state) => state.openAddressInput);

  const activeDownloadsCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending',
  ).length;

  const handleOpenInBrowser = (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return;
    }

    Keyboard.dismiss();
    setIsAddressResolving(true);
    const resolved = openAddressInput(trimmed);
    setLoadingTarget(resolved.targetUrl);

    setTimeout(() => {
      setIsAddressResolving(false);
      setLoadingTarget(null);
      setAddressInput('');
      navigation.navigate('Browser');
    }, 320);
  };

  const handleQuickSitePress = (site: QuickAccessSite) => {
    handleOpenInBrowser(site.url);
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Top App Header with Logo, App Name, Download History & Settings Shortcuts */}
        <AppHeader
          activeDownloadsCount={activeDownloadsCount}
          onDownloadsPress={() => navigation.navigate('Downloads')}
          onSettingsPress={() => navigation.navigate('Settings')}
        />

        {/* Hero / Welcome Section */}
        <View
          style={[
            styles.welcomeCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <View style={styles.welcomeHeaderRow}>
            <View
              style={[
                styles.heroBadge,
                { backgroundColor: colors.primarySoft },
              ]}>
              <ShieldIcon size={15} color={colors.primary} />
              <Text style={[styles.heroBadgeText, { color: colors.primary }]}>
                SMART VIDEO DETECTION & AD SHIELD READY
              </Text>
            </View>
          </View>

          <View style={styles.heroBrandSection}>
            <BdmLogoMark size={52} />
            <View style={styles.heroTextCol}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                Download Smarter.{'\n'}Browse Better.
              </Text>
              <Text
                style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Open any webpage with direct HTML5 MP4 or WebM media to detect
                and save videos with one tap.
              </Text>
            </View>
          </View>

          {/* Address / Search Bar */}
          <View style={styles.addressBarWrap}>
            <AddressBar
              value={addressInput}
              onChangeText={setAddressInput}
              onSubmit={handleOpenInBrowser}
              isLoading={isAddressResolving}
              placeholder="Search or enter website URL (e.g. w3schools.com)..."
            />
          </View>

          {/* Loading Indicator when opening URL */}
          {isAddressResolving && loadingTarget ? (
            <View style={styles.loadingBannerWrap}>
              <LoadingIndicator
                message={`Opening ${loadingTarget} in BDM Browser...`}
              />
            </View>
          ) : null}

          {/* Quick Action Shortcut Pills: Download History & Settings */}
          <View style={styles.shortcutPillsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Downloads')}
              style={[
                styles.shortcutPill,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}>
              <DownloadIcon size={16} color={colors.primary} />
              <Text
                style={[styles.shortcutPillText, { color: colors.textPrimary }]}>
                Download History
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Settings')}
              style={[
                styles.shortcutPill,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}>
              <SettingsIcon size={16} color={colors.secondary} />
              <Text
                style={[styles.shortcutPillText, { color: colors.textPrimary }]}>
                Browser Settings
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Access Section */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Quick Access
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Tap to launch inside the BDM in-app browser
            </Text>
          </View>
        </View>

        <View style={styles.quickAccessGrid}>
          {quickAccessSites.map((site) => (
            <TouchableOpacity
              key={site.id}
              activeOpacity={0.82}
              onPress={() => handleQuickSitePress(site)}
              style={[
                styles.quickCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              <View style={styles.quickCardTop}>
                <View
                  style={[
                    styles.quickIconBox,
                    { backgroundColor: `${site.accentColor}1A` },
                  ]}>
                  {site.category === 'video' ? (
                    <VideoIcon size={18} color={site.accentColor} />
                  ) : site.category === 'search' ? (
                    <SearchIcon size={18} color={site.accentColor} />
                  ) : (
                    <GlobeIcon size={18} color={site.accentColor} />
                  )}
                </View>
                <View
                  style={[
                    styles.categoryTag,
                    { backgroundColor: colors.surfaceElevated },
                  ]}>
                  <Text
                    style={[
                      styles.categoryTagText,
                      { color: colors.textSecondary },
                    ]}>
                    {site.category.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text
                numberOfLines={1}
                style={[styles.quickTitle, { color: colors.textPrimary }]}>
                {site.title}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.quickSubtitle, { color: colors.textSecondary }]}>
                {site.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  welcomeCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  welcomeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  heroBadgeText: {
    ...Typography.label,
    fontSize: 10,
  },
  heroBrandSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  heroTextCol: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    ...Typography.h1,
    fontSize: 23,
    lineHeight: 29,
  },
  heroSubtitle: {
    ...Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  addressBarWrap: {
    marginTop: Spacing.xxs,
  },
  loadingBannerWrap: {
    marginTop: Spacing.xxs,
  },
  shortcutPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxs,
  },
  shortcutPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  shortcutPillText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -Spacing.xs,
  },
  sectionTitle: {
    ...Typography.h2,
  },
  sectionSubtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
  quickAccessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.sm,
  },
  quickCard: {
    width: '48.4%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  quickCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  quickIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  categoryTagText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  quickTitle: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  quickSubtitle: {
    ...Typography.caption,
    fontSize: 11,
  },
});
