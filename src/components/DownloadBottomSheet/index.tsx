import React from 'react';
import { View } from 'react-native';

interface DownloadBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * DownloadBottomSheet foundation (full interactive sheet implemented in Phase 4).
 */
export const DownloadBottomSheet: React.FC<DownloadBottomSheetProps> = ({
  visible,
}) => {
  if (!visible) {
    return null;
  }
  return <View />;
};
