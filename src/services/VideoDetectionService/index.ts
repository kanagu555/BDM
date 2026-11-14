import { DetectedVideo } from '../../types';
import { NativeBdmDownloadModule } from '../../native';

interface RawWebViewVideoItem {
  url?: string;
  title?: string;
  extension?: string;
  mimeType?: string;
  durationSeconds?: number;
}

interface RawWebViewVideoMessage {
  type?: string;
  pageUrl?: string;
  pageTitle?: string;
  videos?: RawWebViewVideoItem[];
  iframeUrls?: string[];
}

export interface ParsedWebViewVideoPayload {
  videos: DetectedVideo[];
  iframeUrls: string[];
  pageUrl: string;
  pageTitle: string;
}

/**
 * Injected JavaScript that runs inside the WebView to inspect HTML5 <video> and <source>
 * elements, detect direct MP4 and WebM URLs, monitor DOM changes with MutationObserver,
 * and communicate detected videos back to React Native via postMessage.
 *
 * Strictly ignores blob:, data:, DRM/EME mediaKeys, and adaptive streaming manifests (.m3u8/.mpd).
 */
const WEBVIEW_VIDEO_DETECTION_SCRIPT = `
(function() {
  if (typeof window === 'undefined' || !window.ReactNativeWebView) {
    return true;
  }

  function resolveAbsoluteUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return null;
    }
    var trimmed = rawUrl.trim();
    if (
      !trimmed ||
      trimmed.indexOf('blob:') === 0 ||
      trimmed.indexOf('data:') === 0 ||
      trimmed.indexOf('javascript:') === 0 ||
      trimmed.indexOf('mediasource:') === 0
    ) {
      return null;
    }
    try {
      var resolved = new URL(trimmed, window.location.href);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return null;
      }
      return resolved.href;
    } catch (e) {
      return null;
    }
  }

  function detectFormat(urlStr, declaredType) {
    var lowerUrl = (urlStr || '').toLowerCase();
    var lowerType = (declaredType || '').toLowerCase();

    // Never treat HLS/DASH manifests as direct MP4/WebM downloads
    if (
      lowerUrl.indexOf('.m3u8') !== -1 ||
      lowerUrl.indexOf('.mpd') !== -1 ||
      lowerType.indexOf('mpegurl') !== -1 ||
      lowerType.indexOf('dash+xml') !== -1
    ) {
      return null;
    }

    var cleanPath = lowerUrl.split('?')[0].split('#')[0];

    if (cleanPath.endsWith('.webm') || lowerUrl.indexOf('.webm?') !== -1 || lowerType.indexOf('video/webm') !== -1) {
      return { extension: 'webm', mimeType: 'video/webm' };
    }

    if (cleanPath.endsWith('.mp4') || cleanPath.endsWith('.m4v') || lowerUrl.indexOf('.mp4?') !== -1 || lowerType.indexOf('video/mp4') !== -1) {
      return { extension: 'mp4', mimeType: 'video/mp4' };
    }

    return null;
  }

  function extractReadableTitle(urlStr, elementTitle, fallbackPageTitle, index) {
    if (elementTitle && typeof elementTitle === 'string' && elementTitle.trim().length > 0) {
      return elementTitle.trim();
    }
    try {
      var parsed = new URL(urlStr);
      var segments = parsed.pathname.split('/').filter(Boolean);
      var lastSegment = segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]) : '';
      var withoutExt = lastSegment.replace(/\\.(mp4|webm|m4v)$/i, '').replace(/[-_]+/g, ' ').trim();
      if (withoutExt && withoutExt.length >= 2) {
        if (fallbackPageTitle && fallbackPageTitle.trim().length > 0) {
          return withoutExt + ' — ' + fallbackPageTitle.trim();
        }
        return withoutExt;
      }
    } catch (e) {}

    if (fallbackPageTitle && fallbackPageTitle.trim().length > 0) {
      return index > 0
        ? fallbackPageTitle.trim() + ' (Video ' + (index + 1) + ')'
        : fallbackPageTitle.trim();
    }
    return 'Detected Video ' + (index + 1);
  }

  var lastSignature = '';

  function scanPageVideos(forceEmit) {
    try {
      var seenUrls = {};
      var detectedList = [];
      var pageTitle = (document && document.title) ? document.title.trim() : '';
      var pageUrl = window.location.href || '';

      function addCandidate(rawUrl, declaredType, customTitle, durationSec, allowFallbackVideoTag) {
        var absUrl = resolveAbsoluteUrl(rawUrl);
        if (!absUrl) {
          return;
        }
        var format = detectFormat(absUrl, declaredType);
        if (!format && allowFallbackVideoTag) {
          // If inside a <video src="..."> tag with a direct http(s) URL (and not m3u8/mpd)
          var lower = absUrl.toLowerCase();
          if (lower.indexOf('.m3u8') === -1 && lower.indexOf('.mpd') === -1) {
            format = { extension: 'mp4', mimeType: 'video/mp4' };
          }
        }
        if (!format) {
          return;
        }

        var normalizedKey = absUrl;
        if (seenUrls[normalizedKey]) {
          return;
        }
        seenUrls[normalizedKey] = true;

        var title = extractReadableTitle(
          absUrl,
          customTitle,
          pageTitle,
          detectedList.length
        );

        detectedList.push({
          url: absUrl,
          title: title,
          extension: format.extension,
          mimeType: format.mimeType,
          durationSeconds:
            typeof durationSec === 'number' && isFinite(durationSec) && durationSec > 0
              ? Math.round(durationSec)
              : undefined,
        });
      }

      // 1. Check if current document URL itself is a direct .mp4 / .webm file
      var selfFormat = detectFormat(pageUrl, document.contentType || '');
      if (selfFormat) {
        addCandidate(pageUrl, selfFormat.mimeType, pageTitle, undefined, false);
      }

      // 2. Inspect all HTML5 <video> elements and their child <source> elements
      var videoNodes = document.querySelectorAll('video');
      for (var i = 0; i < videoNodes.length; i++) {
        var videoEl = videoNodes[i];

        // Respect DRM / encrypted media restrictions: skip any DRM-protected video element
        if (videoEl.mediaKeys || videoEl.hasAttribute('data-drm')) {
          continue;
        }

        var elTitle =
          videoEl.getAttribute('title') ||
          videoEl.getAttribute('aria-label') ||
          videoEl.getAttribute('data-title') ||
          '';
        var duration = videoEl.duration;

        if (videoEl.currentSrc) {
          addCandidate(videoEl.currentSrc, '', elTitle, duration, true);
        }

        var directSrc = videoEl.getAttribute('src') || videoEl.src;
        if (directSrc) {
          addCandidate(
            directSrc,
            videoEl.getAttribute('type') || '',
            elTitle,
            duration,
            true
          );
        }

        var sourceNodes = videoEl.querySelectorAll('source');
        for (var j = 0; j < sourceNodes.length; j++) {
          var srcEl = sourceNodes[j];
          var sUrl = srcEl.getAttribute('src') || srcEl.src;
          var sType = srcEl.getAttribute('type') || srcEl.type || '';
          if (sUrl) {
            addCandidate(sUrl, sType, elTitle, duration, true);
          }
        }
      }

      // 3. Inspect direct <a href="...mp4|webm"> links on the page (e.g. open video archives)
      var anchorNodes = document.querySelectorAll('a[href]');
      for (var k = 0; k < anchorNodes.length && detectedList.length < 25; k++) {
        var aEl = anchorNodes[k];
        var href = aEl.getAttribute('href') || '';
        if (href && (href.toLowerCase().indexOf('.mp4') !== -1 || href.toLowerCase().indexOf('.webm') !== -1)) {
          var linkText = (aEl.textContent || aEl.getAttribute('title') || '').trim();
          addCandidate(href, '', linkText, undefined, false);
        }
      }

      // 4. Inspect <iframe src="..."> player embeds (same-origin DOM + cross-origin URLs)
      var iframeUrls = [];
      var seenIframes = {};
      function addIframeCandidate(rawIframeUrl) {
        var absIframe = resolveAbsoluteUrl(rawIframeUrl);
        if (!absIframe || seenIframes[absIframe]) {
          return;
        }
        var lowerIframe = absIframe.toLowerCase();
        if (
          lowerIframe.indexOf('google.com/recaptcha') !== -1 ||
          lowerIframe.indexOf('doubleclick.net') !== -1 ||
          lowerIframe.indexOf('googlesyndication.com') !== -1 ||
          lowerIframe.indexOf('chatbro.com') !== -1 ||
          lowerIframe.indexOf('facebook.com/plugins') !== -1
        ) {
          return;
        }
        seenIframes[absIframe] = true;
        if (iframeUrls.length < 6) {
          iframeUrls.push(absIframe);
        }
      }

      var iframeNodes = document.querySelectorAll('iframe');
      for (var m = 0; m < iframeNodes.length; m++) {
        var iframeEl = iframeNodes[m];
        var iSrc =
          iframeEl.getAttribute('src') ||
          iframeEl.getAttribute('data-src') ||
          iframeEl.src ||
          '';
        if (iSrc) {
          addIframeCandidate(iSrc);
        }
        try {
          var innerDoc = iframeEl.contentDocument;
          if (innerDoc) {
            var innerVideos = innerDoc.querySelectorAll('video');
            for (var iv = 0; iv < innerVideos.length; iv++) {
              var iVid = innerVideos[iv];
              if (iVid.currentSrc) {
                addCandidate(iVid.currentSrc, '', pageTitle, iVid.duration, true);
              }
              if (iVid.src) {
                addCandidate(iVid.src, '', pageTitle, iVid.duration, true);
              }
            }
          }
        } catch (e) {}
      }

      // 5. Also inspect active server switcher buttons with base64 data-token (e.g. 9anime.si)
      var tokenNodes = document.querySelectorAll('.server-btn.active[data-token], [data-token]');
      for (var t = 0; t < tokenNodes.length && iframeUrls.length < 4; t++) {
        var rawToken = tokenNodes[t].getAttribute('data-token') || '';
        if (rawToken && rawToken.length > 10) {
          try {
            var decodedStr = atob(rawToken);
            var parsedToken = JSON.parse(decodedStr);
            if (parsedToken && typeof parsedToken.u === 'string') {
              addIframeCandidate(parsedToken.u);
            }
          } catch (e) {}
        }
      }

      var currentSignature =
        pageUrl +
        '::' +
        detectedList
          .map(function(item) {
            return item.url;
          })
          .join('|') +
        '::iframes:' +
        iframeUrls.join('|');

      if (!forceEmit && currentSignature === lastSignature) {
        return;
      }
      lastSignature = currentSignature;

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'BDM_VIDEOS_DETECTED',
          pageUrl: pageUrl,
          pageTitle: pageTitle,
          videos: detectedList,
          iframeUrls: iframeUrls,
        })
      );
    } catch (err) {
      // Never break host webpage execution
    }
  }

  window.__BDM_SCAN_VIDEOS__ = scanPageVideos;

  if (!window.__BDM_VIDEO_DETECTOR_ACTIVE__) {
    window.__BDM_VIDEO_DETECTOR_ACTIVE__ = true;

    var debounceTimer = null;
    function scheduleScan() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(function() {
        scanPageVideos(false);
      }, 250);
    }

    // Monitor DOM changes for dynamically added/removed <video> and <source> elements
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      var observer = new MutationObserver(function() {
        scheduleScan();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'type', 'href'],
      });
    }

    // Listen for HTML5 media lifecycle events in capture phase
    ['loadedmetadata', 'loadstart', 'play', 'emptied', 'durationchange'].forEach(function(evtName) {
      document.addEventListener(
        evtName,
        function() {
          scheduleScan();
        },
        true
      );
    });

    window.addEventListener('popstate', scheduleScan);
    window.addEventListener('hashchange', scheduleScan);
  }

  scanPageVideos(true);
})();
true;
`;

export const VideoDetectionService = {
  supportedExtensions: ['mp4', 'webm'] as const,

  /**
   * Returns the JavaScript snippet injected into the WebView to inspect HTML5 video
   * elements and observe DOM changes.
   */
  getInjectionScript(): string {
    return WEBVIEW_VIDEO_DETECTION_SCRIPT;
  },

  /**
   * Returns a lightweight JavaScript call to trigger an immediate rescan on the active page.
   */
  getRescanScript(): string {
    return `
      (function() {
        if (window.__BDM_SCAN_VIDEOS__) {
          window.__BDM_SCAN_VIDEOS__(true);
        }
      })();
      true;
    `;
  },

  /**
   * Checks whether a URL is a valid, direct http(s) downloadable video URL
   * and not a protected or blob stream.
   */
  isValidDownloadableVideoUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return false;
    }
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('blob:') ||
      lower.startsWith('data:') ||
      lower.includes('.m3u8') ||
      lower.includes('.mpd')
    ) {
      return false;
    }
    return true;
  },

  /**
   * Parses and deduplicates a WebView onMessage payload from the injected detector script,
   * including both direct <video> sources and embedded player <iframe> URLs.
   */
  parseWebViewPayload(
    rawData: string,
    fallbackPageUrl: string,
  ): ParsedWebViewVideoPayload | null {
    if (!rawData || typeof rawData !== 'string') {
      return null;
    }

    try {
      const parsed: RawWebViewVideoMessage = JSON.parse(rawData);
      if (
        !parsed ||
        parsed.type !== 'BDM_VIDEOS_DETECTED' ||
        !Array.isArray(parsed.videos)
      ) {
        return null;
      }

      const pageUrl = parsed.pageUrl || fallbackPageUrl;
      const pageTitle = (parsed.pageTitle || '').trim();
      const seenUrls = new Set<string>();
      const results: DetectedVideo[] = [];
      const now = Date.now();

      for (let i = 0; i < parsed.videos.length; i++) {
        const item = parsed.videos[i];
        const rawUrl = typeof item?.url === 'string' ? item.url.trim() : '';
        if (!rawUrl || !this.isValidDownloadableVideoUrl(rawUrl)) {
          continue;
        }

        const dedupeKey = rawUrl;
        if (seenUrls.has(dedupeKey)) {
          continue;
        }
        seenUrls.add(dedupeKey);

        const ext: 'mp4' | 'webm' =
          item.extension === 'webm' ||
          rawUrl.toLowerCase().split('?')[0].endsWith('.webm')
            ? 'webm'
            : 'mp4';

        const mimeType = ext === 'webm' ? 'video/webm' : 'video/mp4';
        const cleanTitle =
          item.title && item.title.trim().length > 0
            ? item.title.trim()
            : `Video ${results.length + 1}`;

        results.push({
          id: `vid-${ext}-${i}-${rawUrl.length}`,
          url: rawUrl,
          title: cleanTitle,
          extension: ext,
          mimeType,
          pageUrl,
          durationSeconds:
            typeof item.durationSeconds === 'number' && item.durationSeconds > 0
              ? item.durationSeconds
              : undefined,
          detectedAt: now,
        });
      }

      const iframeUrls = Array.isArray(parsed.iframeUrls)
        ? parsed.iframeUrls.filter(
            (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
          )
        : [];

      return {
        videos: results,
        iframeUrls,
        pageUrl,
        pageTitle,
      };
    } catch {
      return null;
    }
  },

  parseWebViewMessage(
    rawData: string,
    fallbackPageUrl: string,
  ): DetectedVideo[] | null {
    const payload = this.parseWebViewPayload(rawData, fallbackPageUrl);
    return payload ? payload.videos : null;
  },

  /**
   * Inspects cross-origin embedded video player <iframe> URLs via the native Android
   * module to extract direct MP4/WebM video streams (such as OPlayer / 9anime embeds).
   */
  async resolveIframeVideos(
    iframeUrls: string[],
    pageUrl: string,
    fallbackPageTitle: string,
    userAgent: string,
  ): Promise<DetectedVideo[]> {
    if (!NativeBdmDownloadModule || iframeUrls.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const extractedList: DetectedVideo[] = [];
    const now = Date.now();

    for (let i = 0; i < iframeUrls.length; i++) {
      const iframeUrl = iframeUrls[i];
      try {
        const items = await NativeBdmDownloadModule.extractVideosFromEmbedUrl(
          iframeUrl,
          pageUrl,
          userAgent,
        );
        if (!Array.isArray(items)) {
          continue;
        }
        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          const url = typeof item?.url === 'string' ? item.url.trim() : '';
          if (!url || !this.isValidDownloadableVideoUrl(url) || seen.has(url)) {
            continue;
          }
          seen.add(url);
          const ext: 'mp4' | 'webm' =
            item.extension === 'webm' ? 'webm' : 'mp4';
          const title =
            item.title && item.title.trim().length > 0
              ? item.title.trim()
              : fallbackPageTitle || `Embedded Video ${extractedList.length + 1}`;
          extractedList.push({
            id: `vid-embed-${ext}-${extractedList.length}-${url.length}`,
            url,
            title,
            extension: ext,
            mimeType: ext === 'webm' ? 'video/webm' : 'video/mp4',
            pageUrl,
            detectedAt: now,
          });
        }
      } catch {
        // Ignore single iframe extraction error
      }
    }

    return extractedList;
  },
};
