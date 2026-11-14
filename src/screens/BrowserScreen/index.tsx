import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { WebView, WebViewNavigation } from 'react-native-webview';
import {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewProgressEvent,
} from 'react-native-webview/lib/WebViewTypes';
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DesktopIcon,
  DownloadIcon,
  GlobeIcon,
  HomeIcon,
  LockIcon,
  MoreVerticalIcon,
  ReloadIcon,
  ShareIcon,
  ShieldIcon,
  TrashIcon,
} from '../../components/Icons/BdmIcons';
import { useAppTheme } from '../../hooks/useAppTheme';
import { BrowserService } from '../../services/BrowserService';
import { useAppStore } from '../../store/useAppStore';
import { Radius, Spacing, Typography } from '../../theme';
import { RootTabParamList } from '../../types';

type BrowserNavigationProp = BottomTabNavigationProp<
  RootTabParamList,
  'Browser'
>;
type BrowserRouteProp = RouteProp<RootTabParamList, 'Browser'>;

interface LoadErrorState {
  code?: number;
  description: string;
  failingUrl?: string;
}

export const BrowserScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<BrowserNavigationProp>();
  const route = useRoute<BrowserRouteProp>();
  const webViewRef = useRef<WebView>(null);

  const currentUrl = useAppStore((state) => state.currentUrl);
  const pageTitle = useAppStore((state) => state.pageTitle);
  const isDesktopMode = useAppStore((state) => state.isDesktopMode);
  const webViewSessionKey = useAppStore((state) => state.webViewSessionKey);
  const openAddressInput = useAppStore((state) => state.openAddressInput);
  const setCurrentUrl = useAppStore((state) => state.setCurrentUrl);
  const recordPageVisit = useAppStore((state) => state.recordPageVisit);
  const toggleDesktopMode = useAppStore((state) => state.toggleDesktopMode);
  const clearBrowserSessionData = useAppStore(
    (state) => state.clearBrowserSessionData,
  );

  const [addressBarText, setAddressBarText] = useState(currentUrl);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  const [showSecurityBanner, setShowSecurityBanner] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // Sync route initialUrl if navigated from HomeScreen
  useEffect(() => {
    const incomingUrl = route.params?.initialUrl;
    if (incomingUrl && incomingUrl !== currentUrl) {
      setCurrentUrl(incomingUrl);
      setAddressBarText(incomingUrl);
      setLoadError(null);
    }
  }, [route.params?.initialUrl, currentUrl, setCurrentUrl]);

  // Keep address bar text synced when currentUrl updates externally
  useEffect(() => {
    if (!isEditingAddress) {
      setAddressBarText(currentUrl);
    }
  }, [currentUrl, isEditingAddress]);

  // Intercept Android Hardware Back button to navigate back inside WebView first
  useFocusEffect(
    useCallback(() => {
      const onHardwareBackPress = () => {
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onHardwareBackPress,
      );
      return () => subscription.remove();
    }, [canGoBack]),
  );

  const isSecure = BrowserService.isSecureUrl(currentUrl);
  const hostname = BrowserService.getHostname(currentUrl);

  const handleAddressSubmit = () => {
    const trimmed = addressBarText.trim();
    Keyboard.dismiss();
    setIsEditingAddress(false);

    if (!trimmed) {
      setAddressBarText(currentUrl);
      return;
    }

    const resolved = openAddressInput(trimmed);
    setLoadError(null);
    setShowSecurityBanner(false);
    setAddressBarText(resolved.targetUrl);

    if (resolved.targetUrl.toLowerCase() === currentUrl.toLowerCase()) {
      webViewRef.current?.reload();
    }
  };

  const handleGoBack = () => {
    if (canGoBack) {
      setLoadError(null);
      webViewRef.current?.goBack();
    }
  };

  const handleGoForward = () => {
    if (canGoForward) {
      setLoadError(null);
      webViewRef.current?.goForward();
    }
  };

  const handleReloadOrStop = () => {
    setLoadError(null);
    if (isLoading) {
      webViewRef.current?.stopLoading();
      setIsLoading(false);
    } else {
      webViewRef.current?.reload();
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setIsLoading(navState.loading);

    if (
      navState.url &&
      navState.url !== 'about:blank' &&
      /^https?:\/\//i.test(navState.url)
    ) {
      setCurrentUrl(navState.url);
      if (!isEditingAddress) {
        setAddressBarText(navState.url);
      }
      if (!navState.loading) {
        recordPageVisit(navState.url, navState.title);
      }
    }
  };

  const handleLoadProgress = (event: WebViewProgressEvent) => {
    const progress = event.nativeEvent.progress;
    setLoadProgress(progress);
    setIsLoading(progress < 1);
  };

  const handleWebViewError = (event: WebViewErrorEvent) => {
    const { code, description, url } = event.nativeEvent;
    setIsLoading(false);
    setLoadError({
      code,
      description:
        description || 'Unable to load this webpage. Check your connection.',
      failingUrl: url || currentUrl,
    });
  };

  const handleHttpError = (event: WebViewHttpErrorEvent) => {
    const { statusCode, description, url } = event.nativeEvent;
    // Only surface main document HTTP errors if matching the top-level URL
    if (url === currentUrl && statusCode >= 500) {
      setLoadError({
        code: statusCode,
        description:
          description || `Server returned HTTP status ${statusCode}.`,
        failingUrl: url,
      });
    }
  };

  const handleShareUrl = async () => {
    setIsMenuVisible(false);
    try {
      await Share.share({
        title: pageTitle || 'Shared from BDM Browser',
        message: currentUrl,
        url: currentUrl,
      });
    } catch {
      // Share dismissed
    }
  };

  const handleToggleDesktop = () => {
    toggleDesktopMode();
    setIsMenuVisible(false);
    setTimeout(() => {
      webViewRef.current?.reload();
    }, 100);
  };

  const handleClearSession = () => {
    setIsMenuVisible(false);
    setLoadError(null);
    clearBrowserSessionData();
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Browser Toolbar */}
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}>
        {/* Back Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Navigate Back"
          disabled={!canGoBack}
          onPress={handleGoBack}
          style={[
            styles.navIconButton,
            !canGoBack && styles.navIconButtonDisabled,
          ]}>
          <ChevronLeftIcon
            size={21}
            color={canGoBack ? colors.textPrimary : colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Forward Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Navigate Forward"
          disabled={!canGoForward}
          onPress={handleGoForward}
          style={[
            styles.navIconButton,
            !canGoForward && styles.navIconButtonDisabled,
          ]}>
          <ChevronRightIcon
            size={21}
            color={canGoForward ? colors.textPrimary : colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Editable URL / Address Pill with Secure Indicator */}
        <View
          style={[
            styles.addressBarPill,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: isEditingAddress ? colors.primary : colors.border,
            },
          ]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              isSecure ? 'Secure HTTPS connection' : 'Unencrypted connection'
            }
            onPress={() => setShowSecurityBanner((prev) => !prev)}
            style={styles.securityBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            {isSecure ? (
              <LockIcon size={15} color={colors.success} />
            ) : (
              <AlertTriangleIcon size={15} color={colors.warning} />
            )}
          </TouchableOpacity>

          <TextInput
            value={isEditingAddress ? addressBarText : addressBarText}
            onChangeText={setAddressBarText}
            placeholder="Search or enter URL..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
            onFocus={() => {
              setIsEditingAddress(true);
              setShowSecurityBanner(false);
            }}
            onBlur={() => {
              setIsEditingAddress(false);
              setAddressBarText(currentUrl);
            }}
            onSubmitEditing={handleAddressSubmit}
            style={[styles.urlInput, { color: colors.textPrimary }]}
          />

          {isEditingAddress && addressBarText.length > 0 ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear URL input"
              onPress={() => setAddressBarText('')}
              style={styles.clearUrlBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <CloseIcon size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Reload / Stop Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isLoading ? 'Stop loading' : 'Reload webpage'}
          onPress={handleReloadOrStop}
          style={styles.navIconButton}>
          {isLoading ? (
            <CloseIcon size={19} color={colors.textPrimary} />
          ) : (
            <ReloadIcon size={18} color={colors.textPrimary} />
          )}
        </TouchableOpacity>

        {/* Menu Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Browser Actions Menu"
          onPress={() => setIsMenuVisible(true)}
          style={styles.navIconButton}>
          <MoreVerticalIcon size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Smooth Top Loading Progress Bar */}
      <View
        style={[
          styles.progressTrack,
          { backgroundColor: isLoading ? colors.border : 'transparent' },
        ]}>
        {isLoading ? (
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${Math.max(8, Math.min(100, Math.round(loadProgress * 100)))}%`,
              },
            ]}
          />
        ) : null}
      </View>

      {/* Optional Security Connection Banner (when padlock is tapped) */}
      {showSecurityBanner ? (
        <View
          style={[
            styles.securityBanner,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}>
          <View style={styles.securityBannerRow}>
            {isSecure ? (
              <ShieldIcon size={18} color={colors.success} />
            ) : (
              <AlertTriangleIcon size={18} color={colors.warning} />
            )}
            <View style={styles.securityBannerTextCol}>
              <Text
                style={[
                  styles.securityBannerTitle,
                  { color: isSecure ? colors.success : colors.warning },
                ]}>
                {isSecure
                  ? `Connection to ${hostname} is secure (HTTPS)`
                  : `Connection to ${hostname} is not encrypted (HTTP)`}
              </Text>
              <Text
                style={[
                  styles.securityBannerSubtitle,
                  { color: colors.textSecondary },
                ]}>
                {isSecure
                  ? 'SSL certificate validation is active and verified.'
                  : 'Avoid entering sensitive information on unencrypted pages.'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowSecurityBanner(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <CloseIcon size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Main Content: WebView & Error Overlay */}
      <View style={styles.webViewContainer}>
        <WebView
          key={`bdm-webview-${webViewSessionKey}-${isDesktopMode ? 'desktop' : 'mobile'}`}
          ref={webViewRef}
          source={{ uri: currentUrl }}
          userAgent={BrowserService.getUserAgent(isDesktopMode)}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
          originWhitelist={['https://*', 'http://*']}
          mixedContentMode="compatibility"
          pullToRefreshEnabled={true}
          startInLoadingState={false}
          onShouldStartLoadWithRequest={(request) => {
            return BrowserService.isAllowedNavigationUrl(request.url);
          }}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => {
            setIsLoading(true);
            setLoadError(null);
          }}
          onLoadProgress={handleLoadProgress}
          onLoadEnd={() => {
            setIsLoading(false);
            setLoadProgress(1);
          }}
          onError={handleWebViewError}
          onHttpError={handleHttpError}
          style={[
            styles.webView,
            { backgroundColor: colors.background },
          ]}
        />

        {/* Webpage Loading Error Overlay */}
        {loadError ? (
          <View
            style={[
              styles.errorOverlay,
              { backgroundColor: colors.background },
            ]}>
            <View
              style={[
                styles.errorCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              <View
                style={[
                  styles.errorIconCircle,
                  { backgroundColor: `${colors.error}18` },
                ]}>
                <AlertTriangleIcon size={28} color={colors.error} />
              </View>
              <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
                Webpage Unavailable
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.errorUrl, { color: colors.primary }]}>
                {loadError.failingUrl || currentUrl}
              </Text>
              <Text
                style={[
                  styles.errorDescription,
                  { color: colors.textSecondary },
                ]}>
                {loadError.description}
              </Text>

              <View style={styles.errorActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLoadError(null);
                    webViewRef.current?.reload();
                  }}
                  style={[
                    styles.retryBtn,
                    { backgroundColor: colors.primary },
                  ]}>
                  <ReloadIcon size={16} color="#FFFFFF" />
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLoadError(null);
                    navigation.navigate('Home');
                  }}
                  style={[
                    styles.homeFallbackBtn,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.homeFallbackBtnText,
                      { color: colors.textPrimary },
                    ]}>
                    BDM Home
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* Browser Actions Modal / Bottom Sheet */}
      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsMenuVisible(false)}>
          <Pressable
            style={[
              styles.menuSheet,
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

            {/* Current Page Info Header */}
            <View
              style={[
                styles.menuPageHeader,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}>
              <GlobeIcon size={20} color={colors.primary} />
              <View style={styles.menuPageTextCol}>
                <Text
                  numberOfLines={1}
                  style={[styles.menuPageTitle, { color: colors.textPrimary }]}>
                  {pageTitle || hostname}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.menuPageUrl,
                    { color: colors.textSecondary },
                  ]}>
                  {currentUrl}
                </Text>
              </View>
            </View>

            {/* Quick Browser Action Grid (Home, Downloads, Reload, Share) */}
            <View style={styles.quickMenuGrid}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setIsMenuVisible(false);
                  navigation.navigate('Home');
                }}
                style={[
                  styles.quickMenuTile,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}>
                <HomeIcon size={20} color={colors.primary} />
                <Text
                  style={[
                    styles.quickMenuTileLabel,
                    { color: colors.textPrimary },
                  ]}>
                  Home
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setIsMenuVisible(false);
                  navigation.navigate('Downloads');
                }}
                style={[
                  styles.quickMenuTile,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}>
                <DownloadIcon size={20} color={colors.primary} />
                <Text
                  style={[
                    styles.quickMenuTileLabel,
                    { color: colors.textPrimary },
                  ]}>
                  Downloads
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setIsMenuVisible(false);
                  handleReloadOrStop();
                }}
                style={[
                  styles.quickMenuTile,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}>
                <ReloadIcon size={20} color={colors.primary} />
                <Text
                  style={[
                    styles.quickMenuTileLabel,
                    { color: colors.textPrimary },
                  ]}>
                  Reload
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleShareUrl}
                style={[
                  styles.quickMenuTile,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}>
                <ShareIcon size={20} color={colors.primary} />
                <Text
                  style={[
                    styles.quickMenuTileLabel,
                    { color: colors.textPrimary },
                  ]}>
                  Share
                </Text>
              </TouchableOpacity>
            </View>

            {/* Menu List Options */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleToggleDesktop}
              style={[
                styles.menuOptionRow,
                { borderBottomColor: colors.border },
              ]}>
              <View style={styles.menuOptionLeft}>
                <DesktopIcon size={19} color={colors.textPrimary} />
                <View>
                  <Text
                    style={[
                      styles.menuOptionTitle,
                      { color: colors.textPrimary },
                    ]}>
                    Desktop Site Mode
                  </Text>
                  <Text
                    style={[
                      styles.menuOptionSub,
                      { color: colors.textSecondary },
                    ]}>
                    {isDesktopMode
                      ? 'Currently requesting desktop websites'
                      : 'Currently requesting mobile websites'}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.modePill,
                  {
                    backgroundColor: isDesktopMode
                      ? colors.primary
                      : colors.surfaceElevated,
                  },
                ]}>
                <Text
                  style={[
                    styles.modePillText,
                    {
                      color: isDesktopMode ? '#FFFFFF' : colors.textSecondary,
                    },
                  ]}>
                  {isDesktopMode ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleClearSession}
              style={styles.menuOptionRow}>
              <View style={styles.menuOptionLeft}>
                <TrashIcon size={19} color={colors.error} />
                <View>
                  <Text
                    style={[
                      styles.menuOptionTitle,
                      { color: colors.error },
                    ]}>
                    Clear Browser Data & History
                  </Text>
                  <Text
                    style={[
                      styles.menuOptionSub,
                      { color: colors.textSecondary },
                    ]}>
                    Reset WebView session and clear recent sites
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  navIconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconButtonDisabled: {
    opacity: 0.35,
  },
  addressBarPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1.2,
    paddingHorizontal: Spacing.sm,
    gap: 6,
  },
  securityBtn: {
    paddingVertical: 4,
    paddingRight: 2,
  },
  urlInput: {
    flex: 1,
    ...Typography.bodyMedium,
    fontSize: 13,
    paddingVertical: 0,
  },
  clearUrlBtn: {
    padding: 4,
  },
  progressTrack: {
    height: 2.5,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  securityBanner: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  securityBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  securityBannerTextCol: {
    flex: 1,
    gap: 2,
  },
  securityBannerTitle: {
    ...Typography.caption,
    fontWeight: '700',
  },
  securityBannerSubtitle: {
    ...Typography.caption,
    fontSize: 11,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  errorCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxs,
  },
  errorTitle: {
    ...Typography.h1,
    textAlign: 'center',
  },
  errorUrl: {
    ...Typography.caption,
    textAlign: 'center',
  },
  errorDescription: {
    ...Typography.body,
    textAlign: 'center',
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    borderRadius: Radius.pill,
  },
  retryBtnText: {
    ...Typography.subtitle,
    color: '#FFFFFF',
    fontSize: 14,
  },
  homeFallbackBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  homeFallbackBtnText: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  menuPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  menuPageTextCol: {
    flex: 1,
    gap: 2,
  },
  menuPageTitle: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  menuPageUrl: {
    ...Typography.caption,
    fontSize: 11,
  },
  quickMenuGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  quickMenuTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 6,
  },
  quickMenuTileLabel: {
    ...Typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  menuOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  menuOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  menuOptionTitle: {
    ...Typography.subtitle,
    fontSize: 14,
  },
  menuOptionSub: {
    ...Typography.caption,
    fontSize: 11,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  modePillText: {
    ...Typography.label,
    fontSize: 10,
  },
});
