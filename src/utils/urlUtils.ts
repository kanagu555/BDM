const DOMAIN_PATTERN =
  /^(https?:\/\/)?(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i;

export interface ResolvedAddressInput {
  targetUrl: string;
  displayTitle: string;
  hostname: string;
  isSearch: boolean;
}

/**
 * Determines whether a user input string is a direct URL/domain or a search query,
 * automatically adding https:// to bare domains.
 */
export function resolveAddressInput(rawInput: string): ResolvedAddressInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      targetUrl: 'https://www.google.com',
      displayTitle: 'Google Search',
      hostname: 'google.com',
      isSearch: false,
    };
  }

  const hasWhitespace = /\s/.test(trimmed);
  const hasExplicitProtocol = /^https?:\/\//i.test(trimmed);
  const looksLikeUrl = !hasWhitespace && (hasExplicitProtocol || DOMAIN_PATTERN.test(trimmed));

  if (looksLikeUrl) {
    const normalizedUrl = hasExplicitProtocol ? trimmed : `https://${trimmed}`;
    const hostname = extractHostname(normalizedUrl);
    return {
      targetUrl: normalizedUrl,
      displayTitle: formatDomainTitle(hostname),
      hostname,
      isSearch: false,
    };
  }

  const encodedQuery = encodeURIComponent(trimmed);
  return {
    targetUrl: `https://www.google.com/search?q=${encodedQuery}`,
    displayTitle: `Search: "${trimmed}"`,
    hostname: 'google.com',
    isSearch: true,
  };
}

export function extractHostname(url: string): string {
  try {
    const withoutProtocol = url.replace(/^https?:\/\//i, '');
    const hostPort = withoutProtocol.split('/')[0] || url;
    return hostPort.replace(/^www\./i, '').toLowerCase();
  } catch {
    return url;
  }
}

export function formatDomainTitle(hostname: string): string {
  const clean = hostname.replace(/^www\./i, '');
  const primarySegment = clean.split('.')[0] || clean;
  return primarySegment.charAt(0).toUpperCase() + primarySegment.slice(1);
}

export function isProbablyUrlInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed) || DOMAIN_PATTERN.test(trimmed);
}
