import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Radius, Spacing, Typography } from '../../theme';
import { DetectedVideo } from '../../types';
import {
  CloseIcon,
  DownloadIcon,
  GlobeIcon,
  ShieldIcon,
  VideoIcon,
} from '../Icons/BdmIcons';

interface DownloadBottomSheetProps {
  visible: boolean;
  videos: DetectedVideo[];
  onClose: () => void;
  onDownload: (video: DetectedVideo, fileName: string) => void;
}

function sanitizeFileName(rawTitle: string, extension: 'mp4' | 'webm'): string {
  const cleaned = rawTitle
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  const baseName = cleaned || `BDM_Video_${Date.now()}`;
  const lower = baseName.toLowerCase();
  if (lower.endsWith(`.${extension}`)) {
    return baseName;
  }
  return `${baseName}.${extension}`;
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const DownloadBottomSheet: React.FC<DownloadBottomSheetProps> = ({
  visible,
  videos,
  onClose,
  onDownload,
}) => {
  const { colors } = useAppTheme();
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [customFileName, setCustomFileName] = useState<string>('');

  const slideAnim = useRef(new Animated.Value(380)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const selectedVideo: DetectedVideo | undefined =
    videos.find((v) => v.id === selectedVideoId) || videos[0];

  // Initialize selection when bottom sheet opens or video list updates
  useEffect(() => {
    if (visible && videos.length > 0) {
      const currentExists = videos.some((v) => v.id === selectedVideoId);
      const target = currentExists
        ? videos.find((v) => v.id === selectedVideoId)!
        : videos[0];
      setSelectedVideoId(target.id);
      setCustomFileName(sanitizeFileName(target.title, target.extension));
    }
  }, [visible, videos, selectedVideoId]);

  // Animate sheet entrance when visible becomes true
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(380);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 210,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleAnimatedClose = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 380,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleSelectVideo = (video: DetectedVideo) => {
    setSelectedVideoId(video.id);
    setCustomFileName(sanitizeFileName(video.title, video.extension));
  };

  const handleConfirmDownload = () => {
    if (!selectedVideo) {
      return;
    }
    const finalName = sanitizeFileName(
      customFileName.trim() || selectedVideo.title,
      selectedVideo.extension,
    );
    onDownload(selectedVideo, finalName);
  };

  if (!visible || !selectedVideo) {
    return null;
  }

  const formattedDuration = formatDuration(selectedVideo.durationSeconds);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleAnimatedClose}>
      <View style={styles.modalRoot}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
            },
          ]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleAnimatedClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              transform: [{ translateY: slideAnim }],
            },
          ]}>
          {/* Top Drag Handle */}
          <View style={styles.handleRow}>
            <View
              style={[styles.handleBar, { backgroundColor: colors.border }]}
            />
          </View>

          {/* Sheet Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.headerIconBox,
                  { backgroundColor: colors.primarySoft },
                ]}>
                <VideoIcon size={22} color={colors.primary} />
              </View>
              <View>
                <Text
                  style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  {videos.length > 1
                    ? `Download Video (${videos.length} Detected)`
                    : 'Download Detected Video'}
                </Text>
                <Text
                  style={[
                    styles.headerSubtitle,
                    { color: colors.textSecondary },
                  ]}>
                  Saves directly to Downloads/BDM
                </Text>
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close download sheet"
              onPress={handleAnimatedClose}
              style={[
                styles.closeIconButton,
                { backgroundColor: colors.surfaceElevated },
              ]}>
              <CloseIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* Multiple Video Selection List (when > 1 video is detected) */}
            {videos.length > 1 ? (
              <View style={styles.sectionBlock}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.textSecondary },
                  ]}>
                  SELECT VIDEO SOURCE ({videos.length})
                </Text>
                <View style={styles.selectionList}>
                  {videos.map((vid, idx) => {
                    const isSelected = vid.id === selectedVideo.id;
                    const dur = formatDuration(vid.durationSeconds);
                    return (
                      <TouchableOpacity
                        key={vid.id}
                        activeOpacity={0.82}
                        onPress={() => handleSelectVideo(vid)}
                        style={[
                          styles.selectionCard,
                          {
                            backgroundColor: isSelected
                              ? colors.primarySoft
                              : colors.surfaceElevated,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}>
                        <View
                          style={[
                            styles.radioOuter,
                            {
                              borderColor: isSelected
                                ? colors.primary
                                : colors.textSecondary,
                            },
                          ]}>
                          {isSelected ? (
                            <View
                              style={[
                                styles.radioInner,
                                { backgroundColor: colors.primary },
                              ]}
                            />
                          ) : null}
                        </View>

                        <View style={styles.selectionInfoCol}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.selectionTitle,
                              { color: colors.textPrimary },
                            ]}>
                            {vid.title || `Video Source ${idx + 1}`}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.selectionUrl,
                              { color: colors.textSecondary },
                            ]}>
                            {vid.url}
                          </Text>
                        </View>

                        <View style={styles.selectionBadgesCol}>
                          <View
                            style={[
                              styles.extBadge,
                              {
                                backgroundColor: isSelected
                                  ? colors.primary
                                  : colors.secondary,
                              },
                            ]}>
                            <Text style={styles.extBadgeText}>
                              .{vid.extension.toUpperCase()}
                            </Text>
                          </View>
                          {dur ? (
                            <Text
                              style={[
                                styles.durationText,
                                { color: colors.textSecondary },
                              ]}>
                              {dur}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Selected Video Details Card: Title, Extension, URL Preview */}
            <View
              style={[
                styles.detailsCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}>
              <View style={styles.detailsTopRow}>
                <View style={styles.detailsTitleCol}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.textSecondary },
                    ]}>
                    DETECTED VIDEO TITLE
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.detectedTitleText,
                      { color: colors.textPrimary },
                    ]}>
                    {selectedVideo.title}
                  </Text>
                </View>

                <View style={styles.formatMetaCol}>
                  <View
                    style={[
                      styles.extLargeBadge,
                      { backgroundColor: colors.primary },
                    ]}>
                    <Text style={styles.extLargeBadgeText}>
                      {selectedVideo.extension.toUpperCase()}
                    </Text>
                  </View>
                  {formattedDuration ? (
                    <Text
                      style={[
                        styles.durationMetaText,
                        { color: colors.textSecondary },
                      ]}>
                      {formattedDuration}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Editable File Name Input */}
              <View style={styles.fileNameBlock}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  SAVE AS FILE NAME
                </Text>
                <View
                  style={[
                    styles.fileNameInputWrap,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}>
                  <TextInput
                    value={customFileName}
                    onChangeText={setCustomFileName}
                    placeholder={`video.${selectedVideo.extension}`}
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.fileNameInput,
                      { color: colors.textPrimary },
                    ]}
                  />
                </View>
              </View>

              {/* Direct Video URL Preview */}
              <View style={styles.urlPreviewBlock}>
                <View style={styles.urlPreviewHeaderRow}>
                  <GlobeIcon size={13} color={colors.primary} />
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.textSecondary },
                    ]}>
                    DIRECT VIDEO URL PREVIEW
                  </Text>
                </View>
                <View
                  style={[
                    styles.urlPreviewBox,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text
                    selectable
                    numberOfLines={3}
                    style={[
                      styles.urlPreviewText,
                      { color: colors.textSecondary },
                    ]}>
                    {selectedVideo.url}
                  </Text>
                </View>
              </View>

              <View style={styles.destinationRow}>
                <ShieldIcon size={14} color={colors.success} />
                <Text
                  style={[
                    styles.destinationText,
                    { color: colors.textSecondary },
                  ]}>
                  Format: {selectedVideo.mimeType} • Destination: Downloads/BDM
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Action Buttons: Cancel & Download */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel download"
              activeOpacity={0.8}
              onPress={handleAnimatedClose}
              style={[
                styles.cancelButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}>
              <Text
                style={[styles.cancelButtonText, { color: colors.textPrimary }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Start video download"
              activeOpacity={0.85}
              onPress={handleConfirmDownload}
              style={[
                styles.downloadButton,
                { backgroundColor: colors.primary },
              ]}>
              <DownloadIcon size={19} color="#FFFFFF" />
              <Text style={styles.downloadButtonText}>
                Download .{selectedVideo.extension.toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  sheetContainer: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    maxHeight: '84%',
    elevation: 16,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  handleBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.h2,
    fontSize: 17,
  },
  headerSubtitle: {
    ...Typography.caption,
    fontSize: 12,
  },
  closeIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sectionBlock: {
    gap: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.label,
    fontSize: 10,
  },
  selectionList: {
    gap: Spacing.xs,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    gap: Spacing.sm,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  selectionInfoCol: {
    flex: 1,
    gap: 2,
  },
  selectionTitle: {
    ...Typography.subtitle,
    fontSize: 13,
  },
  selectionUrl: {
    ...Typography.caption,
    fontSize: 11,
  },
  selectionBadgesCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  extBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  extBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  durationText: {
    ...Typography.caption,
    fontSize: 10,
  },
  detailsCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  detailsTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  detailsTitleCol: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    ...Typography.label,
    fontSize: 10,
  },
  detectedTitleText: {
    ...Typography.subtitle,
    fontSize: 15,
  },
  formatMetaCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  extLargeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  extLargeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  durationMetaText: {
    ...Typography.caption,
    fontSize: 11,
  },
  fileNameBlock: {
    gap: 6,
  },
  fileNameInputWrap: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    height: 42,
    justifyContent: 'center',
  },
  fileNameInput: {
    ...Typography.bodyMedium,
    fontSize: 13,
    paddingVertical: 0,
  },
  urlPreviewBlock: {
    gap: 6,
  },
  urlPreviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  urlPreviewBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  urlPreviewText: {
    ...Typography.caption,
    fontSize: 11,
    lineHeight: 16,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destinationText: {
    ...Typography.caption,
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  downloadButton: {
    flex: 1.6,
    height: 48,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    elevation: 3,
  },
  downloadButtonText: {
    ...Typography.subtitle,
    color: '#FFFFFF',
    fontSize: 14,
  },
});
