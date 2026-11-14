import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Radius, Spacing, Typography } from '../../theme';

interface LoadingIndicatorProps {
  message?: string;
  compact?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Opening inside BDM Browser...',
  compact = false,
}) => {
  const { colors } = useAppTheme();

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        {message ? (
          <Text style={[styles.compactText, { color: colors.textSecondary }]}>
            {message}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={[styles.message, { color: colors.textPrimary }]}>
        {message}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xxs,
  },
  compactText: {
    ...Typography.caption,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  message: {
    ...Typography.bodyMedium,
  },
});
