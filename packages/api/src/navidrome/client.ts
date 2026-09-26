import type { StoredCredentials } from '@sonora/types';
import { NavidromeError, kindForSubsonicCode } from './errors';
import type { SubsonicEnvelope } from './wire';

/** Subsonic API version we speak. Navidrome implements 1.16.1 + OpenSubsonic. */
export const SUBSONIC_API_VERSION = '1.16.1';
export const DEFAULT_CLIENT_NAME = 'Sonora';
export const DEFAULT_TIMEOUT_MS = 15_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ParamValue = string | number | boolean | undefined | null | ReadonlyArray<string | number>;
export type Params = Record<string, ParamValue>;

export interface HttpClientOptions {
  baseUrl: string;
  credentials: StoredCredentials;
  clientName?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Send params as application/x-www-form-urlencoded POST (OpenSubsonic `formPost`). */
  post?: boolean;
  timeoutMs?: number;
}

function appendParams(search: URLSearchParams, params: Params): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else {
      search.append(key, String(value));
    }
  }
}

/**
 * Low-level Subsonic HTTP client.
 *
 * - Authenticates every request with `u` + `t` (md5 token) + `s` (salt).
 * - Always requests JSON and unwraps the `subsonic-response` envelope.
 * - Converts transport and API failures into `NavidromeError`.
 * - Uses only CORS "simple requests" (GET, or form POST without custom headers)
 *   so it works from a browser/Tauri webview against a stock Navidrome.
 */
export class SubsonicHttpClient {
  readonly baseUrl: string;
  readonly clientName: string;
  private readonly credentials: StoredCredentials;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.credentials = opts.credentials;
    this.clientName = opts.clientName ?? DEFAULT_CLIENT_NAME;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new Error('No fetch implementation available');
    // Bind to globalThis: calling window.fetch as a method of another object throws "Illegal invocation".
    this.fetchImpl = opts.fetch ? f : (input, init) => globalThis.fetch(input, init);
  }

  get username(): string {
    return this.credentials.username;
  }

  /** Query params that authenticate a request. */
  authParams(): URLSearchParams {
    const p = new URLSearchParams();
    p.set('u', this.credentials.username);
    p.set('t', this.credentials.token);
    p.set('s', this.credentials.salt);
    p.set('v', SUBSONIC_API_VERSION);
    p.set('c', this.clientName);
    return p;
  }

  /**
   * Builds an absolute, authenticated URL. Used for media endpoints (stream,
   * cover art, download) that are consumed directly by <audio>/<img>.
   */
  buildUrl(endpoint: string, params: Params = {}, opts: { json?: boolean } = {}): string {
    const search = this.authParams();
    if (opts.json) search.set('f', 'json');
    appendParams(search, params);
    return `${this.baseUrl}/rest/${endpoint}?${search.toString()}`;
  }

  async request<T = SubsonicEnvelope>(endpoint: string, params: Params = {}, opts: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = opts.timeoutMs ?? this.timeoutMs;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    let url: string;
    let init: RequestInit;
    if (opts.post) {
      const body = this.authParams();
      body.set('f', 'json');
      appendParams(body, params);
      url = `${this.baseUrl}/rest/${endpoint}`;
      init = { method: 'POST', body, signal: controller.signal };
    } else {
      url = this.buildUrl(endpoint, params, { json: true });
      init = { method: 'GET', signal: controller.signal };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (err) {
      if (timedOut) throw new NavidromeError('timeout', `Request to ${endpoint} timed out`, { cause: err });
      if (opts.signal?.aborted) throw new NavidromeError('aborted', 'Request aborted', { cause: err });
      throw new NavidromeError('network', `Could not reach server (${endpoint})`, { cause: err });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }

    if (response.status === 401 || response.status === 403) {
      throw new NavidromeError('auth', 'Not authorized', { status: response.status });
    }
    if (response.status === 404) {
      throw new NavidromeError('unsupported', `Endpoint ${endpoint} not found — is this a Navidrome/Subsonic server?`, {
        status: 404,
      });
    }
    if (!response.ok) {
      throw new NavidromeError('server', `Server error ${response.status}`, { status: response.status });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new NavidromeError('server', 'Server did not return valid JSON — is this a Navidrome server?', {
        cause: err,
        status: response.status,
      });
    }

    const envelope = (json as { 'subsonic-response'?: SubsonicEnvelope } | null)?.['subsonic-response'];
    if (!envelope || typeof envelope !== 'object') {
      throw new NavidromeError('server', 'Unexpected response format — is this a Navidrome server?');
    }
    if (envelope.status !== 'ok') {
      const code = envelope.error?.code ?? 0;
      throw new NavidromeError(kindForSubsonicCode(code), envelope.error?.message || 'Request failed', { code });
    }
    return envelope as T;
  }
}
