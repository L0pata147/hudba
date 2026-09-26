import type { ServerConfig, ServerInfo, Session, StoredCredentials } from '@sonora/types';
import { hostOf, md5, randomString, validateServerUrl } from '@sonora/utils';
import { NavidromeError } from './errors';
import { SubsonicHttpClient, type FetchLike } from './client';
import type { SubsonicEnvelope, WireUser } from './wire';
import { mapUser } from './mappers';

/**
 * Derives Subsonic token credentials from a password.
 * The returned object is safe to persist: it never contains the password.
 */
export function createCredentials(username: string, password: string, salt: string = randomString(16)): StoredCredentials {
  return { username, salt, token: md5(password + salt) };
}

export interface LoginInput {
  serverUrl: string;
  username: string;
  password: string;
  clientName?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export interface LoginResult {
  session: Session;
  /** true when the server is reached over plain http on a non-local network */
  insecure: boolean;
}

export async function fetchServerInfo(http: SubsonicHttpClient): Promise<ServerInfo> {
  const ping = await http.request<SubsonicEnvelope>('ping');
  let extensions: string[] = [];
  if (ping.openSubsonic) {
    try {
      const ext = await http.request<SubsonicEnvelope & { openSubsonicExtensions?: { name: string }[] }>(
        'getOpenSubsonicExtensions',
      );
      extensions = (ext.openSubsonicExtensions ?? []).map((e) => e.name);
    } catch {
      extensions = [];
    }
  }
  return {
    apiVersion: ping.version,
    type: ping.type,
    serverVersion: ping.serverVersion,
    openSubsonic: Boolean(ping.openSubsonic),
    extensions,
  };
}

/**
 * Validates the server URL, authenticates, and verifies the server responds
 * like Navidrome/Subsonic. Throws `NavidromeError` on failure.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const validation = validateServerUrl(input.serverUrl);
  if (!validation.ok || !validation.url) {
    throw new NavidromeError('api', validation.error ?? 'Invalid server address');
  }
  const username = input.username.trim();
  if (!username) throw new NavidromeError('auth', 'Enter your username.');
  if (!input.password) throw new NavidromeError('auth', 'Enter your password.');

  const credentials = createCredentials(username, input.password);
  const http = new SubsonicHttpClient({
    baseUrl: validation.url,
    credentials,
    clientName: input.clientName,
    fetch: input.fetch,
    timeoutMs: input.timeoutMs,
  });

  const serverInfo = await fetchServerInfo(http);

  let user = mapUser({ username });
  try {
    const res = await http.request<SubsonicEnvelope & { user?: WireUser }>('getUser', { username });
    if (res.user) user = mapUser(res.user);
  } catch (err) {
    // getUser may be restricted on some servers; the ping already proved the credentials work.
    if (err instanceof NavidromeError && err.kind === 'auth') throw err;
  }

  const server: ServerConfig = { url: validation.url, name: hostOf(validation.url) };
  return {
    insecure: Boolean(validation.insecure),
    session: {
      server,
      credentials,
      user,
      serverInfo,
      createdAt: new Date().toISOString(),
    },
  };
}
