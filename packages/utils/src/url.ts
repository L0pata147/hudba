export interface ServerUrlValidation {
  ok: boolean;
  /** Normalized URL (no trailing slash, no `/app` suffix) when ok. */
  url?: string;
  error?: string;
  /** true when the URL uses plain http to a non-local host. */
  insecure?: boolean;
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/i;

export function isLocalHost(host: string): boolean {
  return LOCAL_HOST.test(host);
}

/**
 * Validates and normalizes a Navidrome server URL typed by the user.
 * Accepts values without a scheme ("music.example.com") and strips the
 * web-UI suffix (`/app`, `/app/#/…`) people often paste from the browser.
 */
export function validateServerUrl(raw: string): ServerUrlValidation {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Enter your server address.' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  // Without a scheme assume https, except for LAN/localhost addresses where
  // Navidrome is usually served over plain http.
  const bareHost = input.split(/[/:]/)[0] ?? '';
  const withScheme = hasScheme ? input : `${isLocalHost(bareHost) ? 'http' : 'https'}://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That does not look like a valid address.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// addresses are supported.' };
  }
  if (!parsed.hostname) return { ok: false, error: 'The address is missing a host name.' };
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Do not put credentials in the server address.' };
  }
  let path = parsed.pathname.replace(/\/+$/, '');
  path = path.replace(/\/app(\/.*)?$/, '').replace(/\/rest$/, '');
  const url = `${parsed.protocol}//${parsed.host}${path}`;
  const insecure = parsed.protocol === 'http:' && !isLocalHost(parsed.hostname);
  return { ok: true, url, insecure };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
