import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Radius, Spacing, Typography } from '../../theme';

interface EmptyStateProps {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onActionPress?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  icon,
}) => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}>
      {icon ? (
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: colors.primarySoft },
          ]}>
          {icon}
        </View>
      ) : null}
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {subtitle}
      </Text>
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onActionPress}
          style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.h2,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    maxWidth: 280,
  },
  button: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  buttonText: {
    ...Typography.subtitle,
    color: '#FFFFFF',
  },
});
