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
  queryDownload(downloadId: string): Promise<NativeDownloadProgressEvent>;
  cancelDownload(downloadId: string): Promise<boolean>;
  removeDownloadedFile(downloadId: string): Promise<boolean>;
  openDownloadedFile(downloadId: string, mimeType: string): Promise<boolean>;
  shareDownloadedFile(
    downloadId: string,
    mimeType: string,
    title: string,
  ): Promise<boolean>;
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
