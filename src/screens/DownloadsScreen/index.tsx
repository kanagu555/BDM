import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { EmptyState } from '../../components/EmptyState';
import { DownloadIcon } from '../../components/Icons/BdmIcons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Spacing, Typography } from '../../theme';
import { RootTabParamList } from '../../types';

export const DownloadsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Downloads
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Saved videos in Downloads/BDM
        </Text>
      </View>

      <View style={styles.content}>
        <EmptyState
          title="No Downloads Yet"
          subtitle="Open a webpage containing an HTML5 video in the BDM Browser to detect and download media files."
          actionLabel="Browse Videos"
          onActionPress={() => navigation.navigate('Home')}
          icon={<DownloadIcon size={24} color={colors.primary} />}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  header: {
    paddingVertical: Spacing.md,
    gap: 2,
  },
  title: {
    ...Typography.h1,
  },
  subtitle: {
    ...Typography.caption,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
});
