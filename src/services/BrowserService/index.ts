import {
  resolveAddressInput,
  ResolvedAddressInput,
  extractHostname,
  formatDomainTitle,
} from '../../utils/urlUtils';

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 BDM/1.0';

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 BDM/1.0';

export const BrowserService = {
  resolveInput(input: string): ResolvedAddressInput {
    return resolveAddressInput(input);
  },

  getHostname(url: string): string {
    return extractHostname(url);
  },

  getDomainTitle(url: string): string {
    return formatDomainTitle(extractHostname(url));
  },

  isSecureUrl(url: string): boolean {
    return /^https:\/\//i.test(url.trim());
  },

  /**
   * Security filter: allow only standard http/https and about:blank schemes inside the browser.
   * Blocks file://, javascript:, content://, or untrusted intent schemes.
   */
  isAllowedNavigationUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) {
      return false;
    }
    return /^https?:\/\//i.test(trimmed) || trimmed === 'about:blank';
  },

  getUserAgent(isDesktopMode: boolean): string {
    return isDesktopMode ? DESKTOP_USER_AGENT : MOBILE_USER_AGENT;
  },
};
