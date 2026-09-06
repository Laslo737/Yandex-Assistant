import { randomBytes } from 'crypto';
import { env } from '../../config/env';

class ShortLinkStore {
  private readonly tokenToUrl = new Map<string, string>();
  private readonly urlToToken = new Map<string, string>();

  remember(url: string): string {
    const existing = this.urlToToken.get(url);
    if (existing) return existing;

    let token = '';
    do {
      token = randomBytes(4).toString('base64url');
    } while (this.tokenToUrl.has(token));

    this.tokenToUrl.set(token, url);
    this.urlToToken.set(url, token);
    return token;
  }

  resolve(token: string): string | undefined {
    return this.tokenToUrl.get(token);
  }
}

export const shortLinkStore = new ShortLinkStore();

export function buildShortRedirectUrl(targetUrl: string): string {
  const baseUrl = env.app.publicBaseUrl.replace(/\/+$/, '');
  const token = shortLinkStore.remember(targetUrl);
  return `${baseUrl}/r/${token}`;
}
