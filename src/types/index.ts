export type ThemeMode = 'system' | 'light' | 'dark';

export type RootTabParamList = {
  Home: undefined;
  Browser: { initialUrl?: string } | undefined;
  Downloads: undefined;
  Settings: undefined;
};

export interface QuickAccessSite {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  category: 'video' | 'search' | 'portal' | 'docs';
  accentColor: string;
}

export interface RecentSite {
  id: string;
  title: string;
  url: string;
  hostname: string;
  visitedAt: string;
  isSearch?: boolean;
}

export interface DetectedVideo {
  id: string;
  url: string;
  title: string;
  extension: 'mp4' | 'webm';
  mimeType: string;
  pageUrl: string;
  durationSeconds?: number;
  detectedAt: number;
}

export type DownloadStatus =
  | 'pending'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DownloadItem {
  id: string;
  downloadManagerId?: number;
  title: string;
  fileName: string;
  url: string;
  filePath?: string;
  fileSize: number;
  downloadedBytes: number;
  progress: number;
  status: DownloadStatus;
  createdAt: number;
  errorMessage?: string;
}
