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

const BLOCKED_AD_HOST_KEYWORDS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google',
  'adsterra',
  'popads',
  'popcash',
  'propellerads',
  'exoclick',
  'juicyads',
  'tsyndicate',
  'trafficjunky',
  'hilltopads',
  'clickadu',
  'adcash',
  'galaksion',
  'bidvertiser',
  'outbrain.com',
  'taboola.com',
  'mgid.com',
  'revcontent.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'criteo.com',
  'histats.com',
  'acscdn.com',
  'usrpubtrk',
  'rtmark.net',
  'chatbro.com',
  'onclick',
  'onclkds',
  'a-ads.com',
  'admaven',
  'adspyglass',
  'bidgear',
  'ero-advertising',
  'trafficstars',
  'popunder',
  'clickunder',
  '1xbet',
  'betwinner',
  'mostbet',
  'parimatch',
];

const BLOCKED_AD_URL_PATTERNS = [
  /\/pop(?:under|up)?\b/i,
  /\/click(?:under|out)?\b/i,
  /[?&](?:popunder|clickid|aff_id|aff_sub|ad_id|zoneid|ban_id)=/i,
  /\/adserver\b/i,
  /\/banner(?:s|_ads)?\//i,
];

function getBaseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) {
    return parts.join('.');
  }
  return parts.slice(-2).join('.');
}

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
   * Checks whether a candidate navigation URL is a known ad/tracker/popunder or
   * an unauthorized cross-domain redirect hijack from streaming sites like 9anime.si.
   */
  isAllowedNavigationUrl(
    url: string,
    currentMainUrl?: string,
    navigationTargetUrl?: string,
  ): boolean {
    const trimmed = url.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed === 'about:blank') {
      return true;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      return false;
    }

    const reqHost = extractHostname(trimmed).toLowerCase();
    if (!reqHost) {
      return false;
    }

    // 1. Block known ad, popup, tracker, and betting networks
    for (let i = 0; i < BLOCKED_AD_HOST_KEYWORDS.length; i++) {
      if (reqHost.includes(BLOCKED_AD_HOST_KEYWORDS[i])) {
        return false;
      }
    }

    for (let i = 0; i < BLOCKED_AD_URL_PATTERNS.length; i++) {
      if (BLOCKED_AD_URL_PATTERNS[i].test(trimmed)) {
        return false;
      }
    }

    // 2. Protect streaming sites (such as 9anime.si) against click-hijack redirects to external ad domains
    if (currentMainUrl && /^https?:\/\//i.test(currentMainUrl)) {
      const currentHost = extractHostname(currentMainUrl).toLowerCase();
      const targetHost = navigationTargetUrl
        ? extractHostname(navigationTargetUrl).toLowerCase()
        : '';

      if (currentHost.includes('9anime')) {
        const reqBase = getBaseDomain(reqHost);
        const curBase = getBaseDomain(currentHost);
        const targetBase = targetHost ? getBaseDomain(targetHost) : '';

        const isAllowed9AnimeEcosystem =
          reqBase === curBase ||
          reqBase === targetBase ||
          reqHost.includes('9anime') ||
          reqHost.includes('workers.dev') ||
          reqHost.includes('megacloud') ||
          reqHost.includes('vidstream') ||
          reqHost.includes('mp4upload') ||
          reqHost.includes('filemoon') ||
          reqHost.includes('streamtape');

        if (!isAllowed9AnimeEcosystem) {
          return false;
        }
      }
    }

    return true;
  },

  getUserAgent(isDesktopMode: boolean): string {
    return isDesktopMode ? DESKTOP_USER_AGENT : MOBILE_USER_AGENT;
  },
};
