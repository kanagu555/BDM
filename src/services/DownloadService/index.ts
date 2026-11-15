import { PermissionsAndroid, Platform } from 'react-native';
import {
  NativeBdmDownloadModule,
  NativeDownloadProgressEvent,
  NativeStartDownloadResult,
  NativeStreamDetectedEvent,
  subscribeNativeDownloadProgress,
  subscribeNativeStreamDetected,
} from '../../native';

export interface StartDownloadParams {
  url: string;
  fileName: string;
  title: string;
  mimeType: string;
  userAgent?: string;
}

export const DownloadService = {
  defaultDownloadFolder: 'Downloads/BDM',

  /**
   * Requests version-appropriate Android permissions:
   * - Android 13+ (API >= 33): requests POST_NOTIFICATIONS so system download notifications appear.
   * - Android 9 and below (API <= 28): requests WRITE_EXTERNAL_STORAGE for public Downloads directory.
   * - Android 10–12 (API 29–32): DownloadManager writes to public Downloads without extra permissions.
   */
  async ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    const apiLevel =
      typeof Platform.Version === 'number'
        ? Platform.Version
        : parseInt(String(Platform.Version), 10);

    try {
      if (apiLevel >= 33) {
        const notifPermission =
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        if (notifPermission) {
          const hasNotif = await PermissionsAndroid.check(notifPermission);
          if (!hasNotif) {
            await PermissionsAndroid.request(notifPermission);
          }
        }
        return true;
      }

      if (apiLevel <= 28) {
        const writePerm =
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
        const hasWrite = await PermissionsAndroid.check(writePerm);
        if (hasWrite) {
          return true;
        }
        const status = await PermissionsAndroid.request(writePerm, {
          title: 'Storage Permission Required',
          message:
            'BDM needs storage access to save downloaded videos into your Downloads/BDM folder.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        });
        return status === PermissionsAndroid.RESULTS.GRANTED;
      }

      return true;
    } catch {
      return true;
    }
  },

  async startDownload(
    params: StartDownloadParams,
  ): Promise<NativeStartDownloadResult> {
    if (!NativeBdmDownloadModule) {
      throw new Error('Android DownloadManager native module is unavailable.');
    }

    const allowed = await this.ensurePermissions();
    if (!allowed) {
      throw new Error(
        'Storage permission was denied. Cannot save file to Downloads/BDM.',
      );
    }

    return NativeBdmDownloadModule.startDownload(
      params.url,
      params.fileName,
      params.title,
      params.mimeType,
      params.userAgent ?? null,
    );
  },

  async queryDownload(
    downloadId: string,
  ): Promise<NativeDownloadProgressEvent> {
    if (!NativeBdmDownloadModule) {
      throw new Error('Android DownloadManager native module is unavailable.');
    }
    return NativeBdmDownloadModule.queryDownload(downloadId);
  },

  async cancelDownload(downloadId: string): Promise<boolean> {
    if (!NativeBdmDownloadModule) {
      return false;
    }
    return NativeBdmDownloadModule.cancelDownload(downloadId);
  },

  async removeDownloadedFile(
    downloadId: string,
    localUri?: string,
    fileName?: string,
  ): Promise<boolean> {
    if (!NativeBdmDownloadModule) {
      return false;
    }
    return NativeBdmDownloadModule.removeDownloadedFile(
      downloadId,
      localUri ?? null,
      fileName ?? null,
    );
  },

  async openDownloadedFile(
    downloadId: string,
    mimeType: string,
    localUri?: string,
    fileName?: string,
  ): Promise<boolean> {
    if (!NativeBdmDownloadModule) {
      throw new Error('Android DownloadManager native module is unavailable.');
    }
    return NativeBdmDownloadModule.openDownloadedFile(
      downloadId,
      mimeType,
      localUri ?? null,
      fileName ?? null,
    );
  },

  async shareDownloadedFile(
    downloadId: string,
    mimeType: string,
    title: string,
    localUri?: string,
    fileName?: string,
  ): Promise<boolean> {
    if (!NativeBdmDownloadModule) {
      throw new Error('Android DownloadManager native module is unavailable.');
    }
    return NativeBdmDownloadModule.shareDownloadedFile(
      downloadId,
      mimeType,
      title,
      localUri ?? null,
      fileName ?? null,
    );
  },

  async loadPersistedState(): Promise<string | null> {
    if (!NativeBdmDownloadModule) {
      return null;
    }
    try {
      return await NativeBdmDownloadModule.loadPersistedState();
    } catch {
      return null;
    }
  },

  async savePersistedState(stateJson: string): Promise<boolean> {
    if (!NativeBdmDownloadModule) {
      return false;
    }
    try {
      return await NativeBdmDownloadModule.savePersistedState(stateJson);
    } catch {
      return false;
    }
  },

  subscribeProgress(
    callback: (event: NativeDownloadProgressEvent) => void,
  ): () => void {
    const sub = subscribeNativeDownloadProgress(callback);
    return () => {
      sub?.remove();
    };
  },

  async attachWebViewSniffer(): Promise<boolean> {
    if (!NativeBdmDownloadModule) {
      return false;
    }
    try {
      return await NativeBdmDownloadModule.attachWebViewSniffer();
    } catch {
      return false;
    }
  },

  subscribeStreamDetected(
    callback: (event: NativeStreamDetectedEvent) => void,
  ): () => void {
    const sub = subscribeNativeStreamDetected(callback);
    return () => {
      sub?.remove();
    };
  },

  formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value >= 100 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
  },
};
