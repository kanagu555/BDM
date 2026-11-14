import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { DownloadIcon } from '../Icons/BdmIcons';

interface FloatingDownloadButtonProps {
  visible: boolean;
  count: number;
  onPress: () => void;
}

export const FloatingDownloadButton: React.FC<FloatingDownloadButtonProps> = ({
  visible,
  count,
  onPress,
}) => {
  const { colors } = useAppTheme();

  if (!visible) {
    return null;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.fab, { backgroundColor: colors.primary }]}>
      <DownloadIcon size={24} color="#FFFFFF" />
      {count > 1 ? (
        <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 84,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
