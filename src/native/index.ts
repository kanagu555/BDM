import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import { DownloadStatus } from '../types';

export interface NativeStartDownloadResult {
  downloadId: string;
  fileName: string;
  relativePath: string;
}

export interface NativeExtractedEmbedVideo {
  url: string;
  originalUrl?: string;
  title: string;
  extension: 'mp4' | 'webm';
  mimeType: string;
  quality?: string;
  fileSize?: number;
}

export interface NativeDownloadProgressEvent {
  downloadId: string;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number;
  localUri?: string;
  errorMessage?: string;
}

interface BdmDownloadNativeInterface {
  startDownload(
    url: string,
    fileName: string,
    title: string,
    mimeType: string,
    userAgent: string | null,
  ): Promise<NativeStartDownloadResult>;
  extractVideosFromEmbedUrl(
    embedUrl: string,
    refererUrl: string | null,
    userAgent: string | null,
  ): Promise<NativeExtractedEmbedVideo[]>;
  probeVideoMetadata(
    url: string,
    refererUrl: string | null,
    userAgent: string | null,
  ): Promise<NativeExtractedEmbedVideo | null>;
  queryDownload(downloadId: string): Promise<NativeDownloadProgressEvent>;
  cancelDownload(downloadId: string): Promise<boolean>;
  removeDownloadedFile(
    downloadId: string,
    localUri: string | null,
    fileName: string | null,
  ): Promise<boolean>;
  openDownloadedFile(
    downloadId: string,
    mimeType: string,
    localUri: string | null,
    fileName: string | null,
  ): Promise<boolean>;
  shareDownloadedFile(
    downloadId: string,
    mimeType: string,
    title: string,
    localUri: string | null,
    fileName: string | null,
  ): Promise<boolean>;
  loadPersistedState(): Promise<string | null>;
  savePersistedState(stateJson: string): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const rawModule = NativeModules.BdmDownloadModule as
  | BdmDownloadNativeInterface
  | undefined;

export const NativeBdmDownloadModule: BdmDownloadNativeInterface | null =
  Platform.OS === 'android' && rawModule ? rawModule : null;

const downloadEventEmitter =
  Platform.OS === 'android' && rawModule
    ? new NativeEventEmitter(NativeModules.BdmDownloadModule)
    : null;

export function subscribeNativeDownloadProgress(
  listener: (event: NativeDownloadProgressEvent) => void,
): EmitterSubscription | null {
  if (!downloadEventEmitter) {
    return null;
  }
  return downloadEventEmitter.addListener('BDM_DOWNLOAD_PROGRESS', listener);
}
