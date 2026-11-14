import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../store/useAppStore';
import { Radius, Spacing, Typography } from '../../theme';
import { RootTabParamList } from '../../types';
import { GlobeIcon, ShieldIcon } from '../../components/Icons/BdmIcons';

export const BrowserScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const currentUrl = useAppStore((state) => state.currentUrl);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}>
        <View
          style={[
            styles.urlPill,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}>
          <ShieldIcon size={16} color={colors.success} />
          <Text
            numberOfLines={1}
            style={[styles.urlText, { color: colors.textPrimary }]}>
            {currentUrl}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: colors.primarySoft },
            ]}>
            <GlobeIcon size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Target URL Ready for Browser
          </Text>
          <Text style={[styles.urlPreview, { color: colors.primary }]}>
            {currentUrl}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Full in-app WebView navigation, toolbar controls, and HTML5 video
            playback will be connected in Phase 2.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Home')}
            style={[styles.backButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.backButtonText}>Return to BDM Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  urlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  urlText: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  body: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.h1,
    textAlign: 'center',
  },
  urlPreview: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
  },
  backButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  backButtonText: {
    ...Typography.subtitle,
    color: '#FFFFFF',
  },
});
