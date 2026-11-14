import { create } from 'zustand';
import {
  DownloadItem,
  QuickAccessSite,
  RecentSite,
  ThemeMode,
} from '../types';
import { BrowserService } from '../services/BrowserService';

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
    id: 'qa-archive',
    title: 'Internet Archive',
    subtitle: 'archive.org/details/movies',
    url: 'https://archive.org/details/movies',
    category: 'video',
    accentColor: '#4F46E5',
  },
  {
    id: 'qa-wikimedia',
    title: 'Wikimedia Videos',
    subtitle: 'commons.wikimedia.org',
    url: 'https://commons.wikimedia.org/wiki/Category:Videos',
    category: 'video',
    accentColor: '#0EA5E9',
  },
  {
    id: 'qa-pexels',
    title: 'Pexels Free Videos',
    subtitle: 'pexels.com/videos',
    url: 'https://www.pexels.com/videos/',
    category: 'video',
    accentColor: '#10B981',
  },
  {
    id: 'qa-google',
    title: 'Google Search',
    subtitle: 'google.com',
    url: 'https://www.google.com',
    category: 'search',
    accentColor: '#F59E0B',
  },
  {
    id: 'qa-mdn',
    title: 'MDN Media Guide',
    subtitle: 'developer.mozilla.org',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video',
    category: 'docs',
    accentColor: '#EC4899',
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
  {
    id: 'rec-2',
    title: 'Internet Archive Open Movies',
    url: 'https://archive.org/details/movies',
    hostname: 'archive.org',
    visitedAt: 'Today',
    isSearch: false,
  },
  {
    id: 'rec-3',
    title: 'Wikimedia Commons Public Videos',
    url: 'https://commons.wikimedia.org/wiki/Category:Videos',
    hostname: 'commons.wikimedia.org',
    visitedAt: 'Today',
    isSearch: false,
  },
];

interface AppStoreState {
  themeMode: ThemeMode;
  currentUrl: string;
  isAddressResolving: boolean;
  quickAccessSites: QuickAccessSite[];
  recentSites: RecentSite[];
  downloads: DownloadItem[];
  setThemeMode: (mode: ThemeMode) => void;
  setIsAddressResolving: (loading: boolean) => void;
  openAddressInput: (rawInput: string) => {
    targetUrl: string;
    displayTitle: string;
  };
  removeRecentSite: (id: string) => void;
  clearRecentSites: () => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  themeMode: 'system',
  currentUrl: 'https://www.w3schools.com/html/html5_video.asp',
  isAddressResolving: false,
  quickAccessSites: INITIAL_QUICK_ACCESS,
  recentSites: INITIAL_RECENT_SITES,
  downloads: [],

  setThemeMode: (mode) => set({ themeMode: mode }),

  setIsAddressResolving: (loading) => set({ isAddressResolving: loading }),

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
        recentSites: [newRecent, ...filtered].slice(0, 12),
      };
    });

    return {
      targetUrl: resolved.targetUrl,
      displayTitle: resolved.displayTitle,
    };
  },

  removeRecentSite: (id: string) =>
    set((state) => ({
      recentSites: state.recentSites.filter((item) => item.id !== id),
    })),

  clearRecentSites: () => set({ recentSites: [] }),
}));
