import React, { useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { EmptyState } from '../../components/EmptyState';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  DownloadIcon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  ReloadIcon,
  ShareIcon,
  TrashIcon,
  VideoIcon,
} from '../../components/Icons/BdmIcons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { DownloadService } from '../../services/DownloadService';
import { useAppStore } from '../../store/useAppStore';
import { Radius, Spacing, Typography } from '../../theme';
import { DownloadItem, RootTabParamList } from '../../types';

type FilterTab = 'all' | 'active' | 'completed' | 'failed';

function isActiveStatus(status: DownloadItem['status']): boolean {
  return (
    status === 'pending' || status === 'downloading' || status === 'paused'
  );
}

function isFailedStatus(status: DownloadItem['status']): boolean {
  return status === 'failed' || status === 'cancelled';
}

export const DownloadsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const downloads = useAppStore((state) => state.downloads);
  const pauseDownloadById = useAppStore((state) => state.pauseDownloadById);
  const resumeDownloadById = useAppStore((state) => state.resumeDownloadById);
  const cancelDownloadById = useAppStore((state) => state.cancelDownloadById);
  const deleteDownloadById = useAppStore((state) => state.deleteDownloadById);
  const clearDownloadsList = useAppStore((state) => state.clearDownloadsList);
  const openDownloadedVideo = useAppStore((state) => state.openDownloadedVideo);
  const shareDownloadedVideo = useAppStore(
    (state) => state.shareDownloadedVideo,
  );
  const retryDownloadById = useAppStore((state) => state.retryDownloadById);

  const [selectedTab, setSelectedTab] = useState<FilterTab>('all');
  const [menuTargetItem, setMenuTargetItem] = useState<DownloadItem | null>(
    null,
  );
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const activeDownloads = useMemo(
    () => downloads.filter((d) => isActiveStatus(d.status)),
    [downloads],
  );
  const completedDownloads = useMemo(
    () => downloads.filter((d) => d.status === 'completed'),
    [downloads],
  );
  const failedDownloads = useMemo(
    () => downloads.filter((d) => isFailedStatus(d.status)),
    [downloads],
  );

  const showFeedback = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => {
      setFeedbackBanner(null);
    }, 3500);
  };

  const handleOpenVideo = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    try {
      await openDownloadedVideo(item.id);
    } catch (err: any) {
      showFeedback(err?.message || 'Unable to open video file.');
    }
  };

  const handleShareVideo = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    try {
      await shareDownloadedVideo(item.id);
    } catch (err: any) {
      showFeedback(err?.message || 'Unable to share video file.');
    }
  };

  const handlePauseDownload = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    await pauseDownloadById(item.id);
    showFeedback(`Paused "${item.fileName}"`);
  };

  const handleResumeDownload = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    try {
      await resumeDownloadById(item.id);
      showFeedback(`Resuming "${item.fileName}"`);
    } catch (err: any) {
      showFeedback(err?.message || 'Unable to resume download.');
    }
  };

  const handleCancelDownload = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    await cancelDownloadById(item.id);
    showFeedback(`Cancelled "${item.fileName}"`);
  };

  const handleDeleteDownload = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    await deleteDownloadById(item.id);
    showFeedback(`Deleted "${item.fileName}"`);
  };

  const handleConfirmClearList = () => {
    setShowClearConfirm(false);
    clearDownloadsList();
    showFeedback('Cleared download list. Saved video files remain on your device.');
  };

  const handleRetryDownload = async (item: DownloadItem) => {
    setMenuTargetItem(null);
    try {
      await retryDownloadById(item.id);
      showFeedback(`Retrying download for "${item.fileName}"`);
    } catch (err: any) {
      showFeedback(err?.message || 'Failed to retry download.');
    }
  };

  const renderDownloadCard = (item: DownloadItem) => {
    const isCompleted = item.status === 'completed';
    const isActive = isActiveStatus(item.status);
    const isFailed = isFailedStatus(item.status);

    const statusColor = isCompleted
      ? colors.success
      : isFailed
      ? colors.error
      : item.status === 'paused'
      ? colors.warning
      : colors.primary;

    const statusLabel =
      item.status === 'downloading'
        ? `Downloading • ${item.progress.toFixed(0)}%`
        : item.status === 'pending'
        ? 'Starting download...'
        : item.status === 'paused'
        ? 'Paused'
        : item.status === 'completed'
        ? 'Completed'
        : item.status === 'cancelled'
        ? 'Cancelled'
        : 'Failed';

    const sizeSummary = isCompleted
      ? item.fileSize > 0
        ? DownloadService.formatBytes(item.fileSize)
        : item.downloadedBytes > 0
        ? DownloadService.formatBytes(item.downloadedBytes)
        : 'Saved in Downloads/BDM'
      : item.fileSize > 0
      ? `${DownloadService.formatBytes(item.downloadedBytes)} / ${DownloadService.formatBytes(item.fileSize)}`
      : item.downloadedBytes > 0
      ? `${DownloadService.formatBytes(item.downloadedBytes)} downloaded`
      : 'Connecting...';

    return (
      <View
        key={item.id}
        style={[
          styles.itemCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.itemTopRow}>
          {/* File Thumbnail / Icon Badge */}
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!isCompleted}
            onPress={() => isCompleted && handleOpenVideo(item)}
            style={[
              styles.thumbnailBox,
              {
                backgroundColor: isCompleted
                  ? `${colors.success}18`
                  : isFailed
                  ? `${colors.error}18`
                  : colors.primarySoft,
              },
            ]}>
            {isCompleted ? (
              <PlayIcon size={20} color={colors.success} />
            ) : isFailed ? (
              <AlertTriangleIcon size={20} color={colors.error} />
            ) : (
              <VideoIcon size={20} color={colors.primary} />
            )}
            <View
              style={[
                styles.thumbExtBadge,
                { backgroundColor: statusColor },
              ]}>
              <Text style={styles.thumbExtText}>
                {item.extension.toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>

          {/* File Name, Size & Status Metadata */}
          <View style={styles.itemInfoCol}>
            <Text
              numberOfLines={1}
              style={[styles.fileNameText, { color: colors.textPrimary }]}>
              {item.fileName}
            </Text>

            <View style={styles.metaRow}>
              <Text
                style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
              <Text style={[styles.metaDot, { color: colors.textSecondary }]}>
                •
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.sizeText, { color: colors.textSecondary }]}>
                {sizeSummary}
              </Text>
            </View>

            {item.errorMessage && isFailed ? (
              <Text
                numberOfLines={1}
                style={[styles.errorReasonText, { color: colors.error }]}>
                {item.errorMessage}
              </Text>
            ) : null}
          </View>

          {/* Quick Inline Action + More Options Menu Button */}
          <View style={styles.itemActionsCol}>
            {item.status === 'paused' ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Resume download"
                onPress={() => handleResumeDownload(item)}
                style={[
                  styles.quickActionCircle,
                  { backgroundColor: colors.primary },
                ]}>
                <PlayIcon size={14} color="#FFFFFF" />
              </TouchableOpacity>
            ) : isActive ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Pause download"
                onPress={() => handlePauseDownload(item)}
                style={[
                  styles.quickActionCircle,
                  { backgroundColor: colors.primarySoft },
                ]}>
                <PauseIcon size={14} color={colors.primary} />
              </TouchableOpacity>
            ) : isCompleted ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open downloaded video"
                onPress={() => handleOpenVideo(item)}
                style={[
                  styles.quickActionCircle,
                  { backgroundColor: colors.primary },
                ]}>
                <PlayIcon size={14} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry download"
                onPress={() => handleRetryDownload(item)}
                style={[
                  styles.quickActionCircle,
                  { backgroundColor: colors.primarySoft },
                ]}>
                <ReloadIcon size={15} color={colors.primary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="More download options"
              onPress={() => setMenuTargetItem(item)}
              style={styles.moreButton}>
              <MoreVerticalIcon size={19} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Bar */}
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: colors.surfaceElevated },
          ]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: statusColor,
                width: `${
                  isCompleted
                    ? 100
                    : isActive
                    ? Math.max(4, Math.min(100, item.progress))
                    : 0
                }%`,
              },
            ]}
          />
        </View>
      </View>
    );
  };

  const renderSection = (title: string, items: DownloadItem[], count: number) => {
    if (items.length === 0) {
      return null;
    }
    return (
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <View
            style={[
              styles.sectionCountBadge,
              { backgroundColor: colors.surfaceElevated },
            ]}>
            <Text
              style={[
                styles.sectionCountText,
                { color: colors.textSecondary },
              ]}>
              {count}
            </Text>
          </View>
        </View>
        <View style={styles.sectionList}>
          {items.map((item) => renderDownloadCard(item))}
        </View>
      </View>
    );
  };

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: downloads.length },
    { key: 'active', label: 'Active', count: activeDownloads.length },
    { key: 'completed', label: 'Completed', count: completedDownloads.length },
    { key: 'failed', label: 'Failed', count: failedDownloads.length },
  ];

  const isCurrentTabEmpty =
    (selectedTab === 'all' && downloads.length === 0) ||
    (selectedTab === 'active' && activeDownloads.length === 0) ||
    (selectedTab === 'completed' && completedDownloads.length === 0) ||
    (selectedTab === 'failed' && failedDownloads.length === 0);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Downloads
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Storage location: Internal Storage / Downloads / BDM
          </Text>
        </View>
        {completedDownloads.length + failedDownloads.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Clear download list"
            onPress={() => setShowClearConfirm(true)}
            style={[
              styles.clearListButton,
              {
                backgroundColor: `${colors.error}14`,
                borderColor: `${colors.error}35`,
              },
            ]}>
            <TrashIcon size={14} color={colors.error} />
            <Text style={[styles.clearListButtonText, { color: colors.error }]}>
              Clear List
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Tabs: All, Active, Completed, Failed */}
      <View style={styles.tabsRow}>
        {filterTabs.map((tab) => {
          const isSelected = selectedTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.8}
              onPress={() => setSelectedTab(tab.key)}
              style={[
                styles.tabChip,
                {
                  backgroundColor: isSelected
                    ? colors.primary
                    : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.tabChipLabel,
                  { color: isSelected ? '#FFFFFF' : colors.textPrimary },
                ]}>
                {tab.label}
              </Text>
              <View
                style={[
                  styles.tabCountPill,
                  {
                    backgroundColor: isSelected
                      ? 'rgba(255,255,255,0.22)'
                      : colors.surfaceElevated,
                  },
                ]}>
                <Text
                  style={[
                    styles.tabCountText,
                    { color: isSelected ? '#FFFFFF' : colors.textSecondary },
                  ]}>
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feedback Banner */}
      {feedbackBanner ? (
        <View
          style={[
            styles.feedbackBanner,
            {
              backgroundColor: colors.primarySoft,
              borderColor: colors.border,
            },
          ]}>
          <CheckCircleIcon size={16} color={colors.primary} />
          <Text
            numberOfLines={1}
            style={[styles.feedbackText, { color: colors.textPrimary }]}>
            {feedbackBanner}
          </Text>
        </View>
      ) : null}

      {/* Main Content */}
      {isCurrentTabEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={
              selectedTab === 'all'
                ? 'No Downloads Yet'
                : `No ${selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)} Downloads`
            }
            subtitle="Open any webpage with HTML5 MP4 or WebM videos inside the BDM Browser and tap the floating Download button."
            actionLabel="Open BDM Browser"
            onActionPress={() => navigation.navigate('Browser')}
            icon={<DownloadIcon size={24} color={colors.primary} />}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {selectedTab === 'all' ? (
            <>
              {renderSection(
                'Active Downloads',
                activeDownloads,
                activeDownloads.length,
              )}
              {renderSection(
                'Completed Downloads',
                completedDownloads,
                completedDownloads.length,
              )}
              {renderSection(
                'Failed & Cancelled',
                failedDownloads,
                failedDownloads.length,
              )}
            </>
          ) : null}

          {selectedTab === 'active'
            ? renderSection(
                'Active Downloads',
                activeDownloads,
                activeDownloads.length,
              )
            : null}

          {selectedTab === 'completed'
            ? renderSection(
                'Completed Downloads',
                completedDownloads,
                completedDownloads.length,
              )
            : null}

          {selectedTab === 'failed'
            ? renderSection(
                'Failed & Cancelled',
                failedDownloads,
                failedDownloads.length,
              )
            : null}
        </ScrollView>
      )}

      {/* More Options Action Sheet Modal */}
      <Modal
        visible={menuTargetItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuTargetItem(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMenuTargetItem(null)}>
          <Pressable
            style={[
              styles.optionsSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandleWrap}>
              <View
                style={[
                  styles.sheetHandle,
                  { backgroundColor: colors.border },
                ]}
              />
            </View>

            {menuTargetItem ? (
              <>
                <View
                  style={[
                    styles.sheetHeaderCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}>
                  <VideoIcon size={20} color={colors.primary} />
                  <View style={styles.sheetHeaderInfo}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.sheetFileName,
                        { color: colors.textPrimary },
                      ]}>
                      {menuTargetItem.fileName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.sheetFilePath,
                        { color: colors.textSecondary },
                      ]}>
                      {menuTargetItem.relativePath}
                    </Text>
                  </View>
                </View>

                {/* Completed Actions: Open & Share */}
                {menuTargetItem.status === 'completed' ? (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenVideo(menuTargetItem)}
                      style={[
                        styles.sheetOptionRow,
                        { borderBottomColor: colors.border },
                      ]}>
                      <PlayIcon size={18} color={colors.primary} />
                      <Text
                        style={[
                          styles.sheetOptionText,
                          { color: colors.textPrimary },
                        ]}>
                        Open Downloaded Video
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleShareVideo(menuTargetItem)}
                      style={[
                        styles.sheetOptionRow,
                        { borderBottomColor: colors.border },
                      ]}>
                      <ShareIcon size={18} color={colors.primary} />
                      <Text
                        style={[
                          styles.sheetOptionText,
                          { color: colors.textPrimary },
                        ]}>
                        Share Downloaded Video
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                {/* Active Action: Pause / Resume & Cancel Download */}
                {menuTargetItem.status === 'paused' ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleResumeDownload(menuTargetItem)}
                    style={[
                      styles.sheetOptionRow,
                      { borderBottomColor: colors.border },
                    ]}>
                    <PlayIcon size={18} color={colors.primary} />
                    <Text
                      style={[
                        styles.sheetOptionText,
                        { color: colors.textPrimary },
                      ]}>
                      Resume Download
                    </Text>
                  </TouchableOpacity>
                ) : isActiveStatus(menuTargetItem.status) ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePauseDownload(menuTargetItem)}
                    style={[
                      styles.sheetOptionRow,
                      { borderBottomColor: colors.border },
                    ]}>
                    <PauseIcon size={18} color={colors.primary} />
                    <Text
                      style={[
                        styles.sheetOptionText,
                        { color: colors.textPrimary },
                      ]}>
                      Pause Download
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {isActiveStatus(menuTargetItem.status) ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleCancelDownload(menuTargetItem)}
                    style={[
                      styles.sheetOptionRow,
                      { borderBottomColor: colors.border },
                    ]}>
                    <CloseIcon size={18} color={colors.warning} />
                    <Text
                      style={[
                        styles.sheetOptionText,
                        { color: colors.warning },
                      ]}>
                      Cancel Download
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Failed / Cancelled Action: Retry Download */}
                {isFailedStatus(menuTargetItem.status) ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleRetryDownload(menuTargetItem)}
                    style={[
                      styles.sheetOptionRow,
                      { borderBottomColor: colors.border },
                    ]}>
                    <ReloadIcon size={18} color={colors.primary} />
                    <Text
                      style={[
                        styles.sheetOptionText,
                        { color: colors.textPrimary },
                      ]}>
                      Retry Download
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Delete Downloaded File */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleDeleteDownload(menuTargetItem)}
                  style={styles.sheetOptionRow}>
                  <TrashIcon size={18} color={colors.error} />
                  <Text
                    style={[styles.sheetOptionText, { color: colors.error }]}>
                    Delete Downloaded File
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Clear Download List Confirmation Modal */}
      <Modal
        visible={showClearConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearConfirm(false)}>
        <Pressable
          style={styles.dialogBackdrop}
          onPress={() => setShowClearConfirm(false)}>
          <Pressable
            style={[
              styles.dialogCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <View
              style={[
                styles.dialogIconCircle,
                { backgroundColor: `${colors.error}18` },
              ]}>
              <TrashIcon size={22} color={colors.error} />
            </View>
            <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>
              Clear Download List?
            </Text>
            <Text
              style={[styles.dialogDescription, { color: colors.textSecondary }]}>
              This removes completed and failed entries from your BDM history list. Your downloaded video files in Internal Storage / Downloads / BDM will remain safely saved on your device.
            </Text>
            <View style={styles.dialogActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowClearConfirm(false)}
                style={[
                  styles.dialogCancelBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.dialogCancelBtnText,
                    { color: colors.textPrimary },
                  ]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleConfirmClearList}
                style={[
                  styles.dialogConfirmBtn,
                  { backgroundColor: colors.error },
                ]}>
                <Text style={styles.dialogConfirmBtnText}>Clear List</Text>
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
    paddingHorizontal: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitleCol: {
    flex: 1,
  },
  clearListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  clearListButtonText: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    ...Typography.h1,
  },
  subtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  tabChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  tabChipLabel: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  tabCountPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '800',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  feedbackText: {
    ...Typography.caption,
    fontWeight: '600',
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: Spacing.xxl,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  sectionBlock: {
    gap: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.h2,
    fontSize: 16,
  },
  sectionCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  sectionCountText: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  sectionList: {
    gap: Spacing.sm,
  },
  itemCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  thumbnailBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbExtBadge: {
    position: 'absolute',
    bottom: -4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  thumbExtText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  itemInfoCol: {
    flex: 1,
    gap: 3,
  },
  fileNameText: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  metaDot: {
    fontSize: 11,
  },
  sizeText: {
    ...Typography.caption,
    fontSize: 11,
    flexShrink: 1,
  },
  errorReasonText: {
    ...Typography.caption,
    fontSize: 11,
  },
  itemActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickActionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    width: 30,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  sheetHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  sheetFileName: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  sheetFilePath: {
    ...Typography.caption,
    fontSize: 11,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  sheetOptionText: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dialogIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  dialogTitle: {
    ...Typography.h2,
    fontSize: 18,
    textAlign: 'center',
  },
  dialogDescription: {
    ...Typography.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: Spacing.xs,
  },
  dialogActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.xs,
  },
  dialogCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelBtnText: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  dialogConfirmBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogConfirmBtnText: {
    ...Typography.subtitle,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
