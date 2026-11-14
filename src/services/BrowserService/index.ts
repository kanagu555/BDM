import { resolveAddressInput, ResolvedAddressInput, extractHostname } from '../../utils/urlUtils';

export const BrowserService = {
  resolveInput(input: string): ResolvedAddressInput {
    return resolveAddressInput(input);
  },

  getHostname(url: string): string {
    return extractHostname(url);
  },

  isSecureUrl(url: string): boolean {
    return /^https:\/\//i.test(url.trim());
  },
};
