import { create } from 'zustand';
import {
  DetectedVideo,
  DownloadItem,
  QuickAccessSite,
  RecentSite,
  ThemeMode,
} from '../types';
import { BrowserService } from '../services/BrowserService';
import { DownloadService } from '../services/DownloadService';
import { NativeDownloadProgressEvent } from '../native';

const INITIAL_QUICK_ACCESS: QuickAccessSite[] = [
  {
    id: 'qa-w3video',
    title: 'HTML5 Video Demo',
    subtitle: 'w3schools.com',
    url: 'https://www.w3schools.com/html/html5_video.asp',
    category: 'video',
    accentColor: '#6C5CE7',
  },
  {
    id: 'qa-9anime',
    title: '9anime.si',
    subtitle: 'Anime Streaming Portal',
    url: 'https://9anime.si',
    category: 'video',
    accentColor: '#4F46E5',
  },
];

const INITIAL_RECENT_SITES: RecentSite[] = [
  {
    id: 'rec-1',
    title: 'W3Schools HTML5 Video Test',
    url: 'https://www.w3schools.com/html/html5_video.asp',
    hostname: 'w3schools.com',
    visitedAt: 'Just now',
    isSearch: false,
  },
];

interface AppStoreState {
  isHydrated: boolean;
  themeMode: ThemeMode;
  currentUrl: string;
  navigationTargetUrl: string;
  navigationVersion: number;
  pageTitle: string;
  isDesktopMode: boolean;
  webViewSessionKey: number;
  isAddressResolving: boolean;
  quickAccessSites: QuickAccessSite[];
  recentSites: RecentSite[];
  detectedVideos: DetectedVideo[];
  downloads: DownloadItem[];
  hydrateStore: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  setIsAddressResolving: (loading: boolean) => void;
  setCurrentUrl: (url: string) => void;
  toggleDesktopMode: () => void;
  setDetectedVideos: (videos: DetectedVideo[]) => void;
  mergeDetectedVideos: (videos: DetectedVideo[]) => void;
  clearDetectedVideos: () => void;
  openAddressInput: (rawInput: string) => {
    targetUrl: string;
    displayTitle: string;
  };
  recordPageVisit: (url: string, title?: string) => void;
  removeRecentSite: (id: string) => void;
  clearRecentSites: () => void;
  clearBrowserSessionData: () => void;
  startVideoDownload: (
    video: DetectedVideo,
    customFileName: string,
  ) => Promise<DownloadItem>;
  applyNativeDownloadProgress: (event: NativeDownloadProgressEvent) => void;
  pauseDownloadById: (id: string) => Promise<void>;
  resumeDownloadById: (id: string) => Promise<void>;
  cancelDownloadById: (id: string) => Promise<void>;
  deleteDownloadById: (id: string) => Promise<void>;
  clearDownloadsList: () => void;
  openDownloadedVideo: (id: string) => Promise<void>;
  shareDownloadedVideo: (id: string) => Promise<void>;
  retryDownloadById: (id: string) => Promise<void>;
}

interface PersistedAppState {
  themeMode?: ThemeMode;
  downloads?: DownloadItem[];
}

function persistAppState(themeMode: ThemeMode, downloads: DownloadItem[]) {
  const payload: PersistedAppState = {
    themeMode,
    downloads,
  };
  DownloadService.savePersistedState(JSON.stringify(payload)).catch(() => {});
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  isHydrated: false,
  themeMode: 'system',
  currentUrl: 'https://www.google.com',
  navigationTargetUrl: 'https://www.google.com',
  navigationVersion: 1,
  pageTitle: 'Google Search',
  isDesktopMode: false,
  webViewSessionKey: 1,
  isAddressResolving: false,
  quickAccessSites: INITIAL_QUICK_ACCESS,
  recentSites: INITIAL_RECENT_SITES,
  detectedVideos: [],
  downloads: [],

  hydrateStore: async () => {
    if (get().isHydrated) {
      return;
    }
    try {
      const rawJson = await DownloadService.loadPersistedState();
      if (!rawJson) {
        set({ isHydrated: true });
        return;
      }
      const parsed = JSON.parse(rawJson) as PersistedAppState;
      const validTheme =
        parsed.themeMode === 'light' ||
        parsed.themeMode === 'dark' ||
        parsed.themeMode === 'system'
          ? parsed.themeMode
          : get().themeMode;

      const restoredDownloads = Array.isArray(parsed.downloads)
        ? parsed.downloads.map((item): DownloadItem => {
            if (item.status === 'downloading' || item.status === 'pending') {
              if (item.downloadedBytes > 0 && item.resumable !== false) {
                return {
                  ...item,
                  status: 'paused',
                  errorMessage: undefined,
                };
              }
              return {
                ...item,
                status: 'failed',
                errorMessage:
                  'Download interrupted when app closed. Tap Retry to restart.',
              };
            }
            return item;
          })
        : [];

      set((state) => {
        // Merge any downloads started before hydration completed
        const existingIds = new Set(state.downloads.map((d) => d.id));
        const merged = [
          ...state.downloads,
          ...restoredDownloads.filter((d) => !existingIds.has(d.id)),
        ];
        return {
          isHydrated: true,
          themeMode: validTheme,
          downloads: merged,
        };
      });
    } catch {
      set({ isHydrated: true });
    }
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    persistAppState(mode, get().downloads);
  },

  setIsAddressResolving: (loading) => set({ isAddressResolving: loading }),

  setCurrentUrl: (url) => set({ currentUrl: url }),

  toggleDesktopMode: () =>
    set((state) => ({ isDesktopMode: !state.isDesktopMode })),

  setDetectedVideos: (videos) => set({ detectedVideos: videos }),

  mergeDetectedVideos: (videos) =>
    set((state) => {
      if (videos.length === 0) {
        return state;
      }
      const nextList = [...state.detectedVideos];
      let changed = false;

      for (const incoming of videos) {
        const existingIdx = nextList.findIndex(
          (v) =>
            v.url === incoming.url ||
            (v.originalUrl && v.originalUrl === incoming.url) ||
            (incoming.originalUrl && v.url === incoming.originalUrl) ||
            (incoming.originalUrl &&
              v.originalUrl &&
              v.originalUrl === incoming.originalUrl),
        );

        if (existingIdx >= 0) {
          const current = nextList[existingIdx];
          const updated: DetectedVideo = {
            ...current,
            url: incoming.url || current.url,
            originalUrl: incoming.originalUrl || current.originalUrl,
            fileSize: incoming.fileSize || current.fileSize,
            quality: incoming.quality || current.quality,
            durationSeconds:
              incoming.durationSeconds || current.durationSeconds,
          };
          if (
            updated.url !== current.url ||
            updated.fileSize !== current.fileSize ||
            updated.quality !== current.quality
          ) {
            nextList[existingIdx] = updated;
            changed = true;
          }
        } else {
          nextList.push(incoming);
          changed = true;
        }
      }

      if (!changed) {
        return state;
      }
      return {
        detectedVideos: nextList,
      };
    }),

  clearDetectedVideos: () => set({ detectedVideos: [] }),

  openAddressInput: (rawInput: string) => {
    const resolved = BrowserService.resolveInput(rawInput);
    const newRecent: RecentSite = {
      id: `rec-${Date.now()}`,
      title: resolved.displayTitle,
      url: resolved.targetUrl,
      hostname: resolved.hostname,
      visitedAt: 'Just now',
      isSearch: resolved.isSearch,
    };

    set((state) => {
      const filtered = state.recentSites.filter(
        (site) => site.url.toLowerCase() !== resolved.targetUrl.toLowerCase(),
      );
      return {
        currentUrl: resolved.targetUrl,
        navigationTargetUrl: resolved.targetUrl,
        navigationVersion: state.navigationVersion + 1,
        pageTitle: resolved.displayTitle,
        detectedVideos: [],
        recentSites: [newRecent, ...filtered].slice(0, 15),
      };
    });

    return {
      targetUrl: resolved.targetUrl,
      displayTitle: resolved.displayTitle,
    };
  },

  recordPageVisit: (url: string, title?: string) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      return;
    }
    const hostname = BrowserService.getHostname(url);
    const cleanTitle =
      title && title.trim() && !/^https?:\/\//i.test(title.trim())
        ? title.trim()
        : BrowserService.getDomainTitle(url);

    set((state) => {
      const filtered = state.recentSites.filter(
        (site) => site.url.toLowerCase() !== url.toLowerCase(),
      );
      const updatedEntry: RecentSite = {
        id: `rec-${Date.now()}`,
        title: cleanTitle,
        url,
        hostname,
        visitedAt: 'Just now',
        isSearch: url.includes('google.com/search?q='),
      };
      return {
        pageTitle: cleanTitle,
        recentSites: [updatedEntry, ...filtered].slice(0, 15),
      };
    });
  },

  removeRecentSite: (id: string) =>
    set((state) => ({
      recentSites: state.recentSites.filter((item) => item.id !== id),
    })),

  clearRecentSites: () => set({ recentSites: [] }),

  clearBrowserSessionData: () =>
    set((state) => ({
      currentUrl: 'https://www.google.com',
      navigationTargetUrl: 'https://www.google.com',
      navigationVersion: state.navigationVersion + 1,
      pageTitle: 'Google Search',
      recentSites: [],
      detectedVideos: [],
      webViewSessionKey: state.webViewSessionKey + 1,
    })),

  startVideoDownload: async (video: DetectedVideo, customFileName: string) => {
    const isDesktop = get().isDesktopMode;
    const nativeRes = await DownloadService.startDownload({
      url: video.url,
      fileName: customFileName,
      title: video.title,
      mimeType: video.mimeType,
      userAgent: BrowserService.getUserAgent(isDesktop),
    });

    const newItem: DownloadItem = {
      id: `dl-${nativeRes.downloadId}`,
      downloadManagerId: nativeRes.downloadId,
      title: video.title,
      fileName: nativeRes.fileName,
      extension: video.extension,
      mimeType: video.mimeType,
      url: video.url,
      relativePath: nativeRes.relativePath,
      fileSize: video.fileSize && video.fileSize > 0 ? video.fileSize : 0,
      downloadedBytes: 0,
      progress: 0,
      status: 'downloading',
      resumable: video.resumable,
      completedSegments: 0,
      createdAt: Date.now(),
    };

    set((state) => {
      const updated = [newItem, ...state.downloads];
      persistAppState(state.themeMode, updated);
      return {
        downloads: updated,
      };
    });

    return newItem;
  },

  applyNativeDownloadProgress: (event: NativeDownloadProgressEvent) => {
    set((state) => {
      const target = state.downloads.find(
        (item) => item.downloadManagerId === event.downloadId,
      );
      if (!target) {
        return state;
      }

      const prevStatus = target.status;
      const updatedDownloads = state.downloads.map((item) => {
        if (item.downloadManagerId !== event.downloadId) {
          return item;
        }
        return {
          ...item,
          status: event.status,
          downloadedBytes:
            event.bytesDownloaded > 0
              ? event.bytesDownloaded
              : item.downloadedBytes,
          fileSize:
            event.totalBytes > 0 ? event.totalBytes : item.fileSize,
          progress:
            event.status === 'completed'
              ? 100
              : Math.round(event.progress * 10) / 10,
          completedSegments:
            typeof event.completedSegments === 'number'
              ? event.completedSegments
              : item.completedSegments,
          localUri: event.localUri || item.localUri,
          errorMessage: event.errorMessage || item.errorMessage,
        };
      });

      if (
        prevStatus !== event.status ||
        event.status === 'completed' ||
        event.status === 'paused' ||
        event.status === 'failed' ||
        event.status === 'cancelled'
      ) {
        persistAppState(state.themeMode, updatedDownloads);
      }

      return {
        downloads: updatedDownloads,
      };
    });
  },

  pauseDownloadById: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (!target) {
      return;
    }
    try {
      await DownloadService.pauseDownload(target.downloadManagerId);
    } catch {
      // Ignore if already stopped
    }
    set((state) => {
      const updated = state.downloads.map((d) =>
        d.id === id ? { ...d, status: 'paused' as const } : d,
      );
      persistAppState(state.themeMode, updated);
      return {
        downloads: updated,
      };
    });
  },

  resumeDownloadById: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (!target) {
      return;
    }
    const isDesktop = get().isDesktopMode;
    await DownloadService.resumeDownload({
      downloadId: target.downloadManagerId,
      url: target.url,
      fileName: target.fileName,
      title: target.title,
      mimeType: target.mimeType,
      totalBytesHint: target.fileSize,
      completedSegmentsHint: target.completedSegments ?? 0,
      userAgent: BrowserService.getUserAgent(isDesktop),
    });
    set((state) => {
      const updated = state.downloads.map((d) =>
        d.id === id
          ? {
              ...d,
              status: 'downloading' as const,
              errorMessage: undefined,
            }
          : d,
      );
      persistAppState(state.themeMode, updated);
      return {
        downloads: updated,
      };
    });
  },

  cancelDownloadById: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (!target) {
      return;
    }
    try {
      await DownloadService.cancelDownload(target.downloadManagerId);
    } catch {
      // Ignore if already removed by OS
    }
    set((state) => {
      const updated = state.downloads.map((d) =>
        d.id === id
          ? { ...d, status: 'cancelled' as const, progress: 0 }
          : d,
      );
      persistAppState(state.themeMode, updated);
      return {
        downloads: updated,
      };
    });
  },

  deleteDownloadById: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (target) {
      try {
        await DownloadService.removeDownloadedFile(
          target.downloadManagerId,
          target.localUri,
          target.fileName,
        );
      } catch {
        // Ignore if file already deleted
      }
    }
    set((state) => {
      const updated = state.downloads.filter((d) => d.id !== id);
      persistAppState(state.themeMode, updated);
      return {
        downloads: updated,
      };
    });
  },

  clearDownloadsList: () => {
    set((state) => {
      // Keep only actively downloading items so running background tasks aren't orphaned;
      // clear all completed, failed, and cancelled items from the list (files stay on disk).
      const activeOnly = state.downloads.filter(
        (d) => d.status === 'downloading' || d.status === 'pending',
      );
      persistAppState(state.themeMode, activeOnly);
      return {
        downloads: activeOnly,
      };
    });
  },

  openDownloadedVideo: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (!target) {
      throw new Error('Download entry not found.');
    }
    await DownloadService.openDownloadedFile(
      target.downloadManagerId,
      target.mimeType,
      target.localUri,
      target.fileName,
    );
  },

  shareDownloadedVideo: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (!target) {
      throw new Error('Download entry not found.');
    }
    await DownloadService.shareDownloadedFile(
      target.downloadManagerId,
      target.mimeType,
      target.title,
      target.localUri,
      target.fileName,
    );
  },

  retryDownloadById: async (id: string) => {
    const target = get().downloads.find((d) => d.id === id);
    if (!target) {
      return;
    }
    const isDesktop = get().isDesktopMode;
    const nativeRes = await DownloadService.startDownload({
      url: target.url,
      fileName: target.fileName,
      title: target.title,
      mimeType: target.mimeType,
      userAgent: BrowserService.getUserAgent(isDesktop),
    });

    set((state) => {
      const updated = state.downloads.map((d) =>
        d.id === id
          ? {
              ...d,
              downloadManagerId: nativeRes.downloadId,
              fileName: nativeRes.fileName,
              relativePath: nativeRes.relativePath,
              status: 'downloading' as const,
              progress: 0,
              downloadedBytes: 0,
              errorMessage: undefined,
            }
          : d,
      );
      persistAppState(state.themeMode, updated);
      return {
        downloads: updated,
      };
    });
  },
}));
