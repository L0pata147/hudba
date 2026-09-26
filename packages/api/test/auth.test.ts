import { describe, expect, it } from 'vitest';
import { md5 } from '@sonora/utils';
import { NavidromeError, createCredentials, login } from '../src';
import { mockServer } from './mock-server';

describe('authentication', () => {
  it('derives token credentials without storing the password', () => {
    const c = createCredentials('alice', 'hunter2', 'salty');
    expect(c).toEqual({ username: 'alice', salt: 'salty', token: md5('hunter2salty') });
    expect(JSON.stringify(c)).not.toContain('hunter2');
  });

  it('logs in with token auth and verifies the server', async () => {
    const server = mockServer({ password: 'hunter2' });
    const { session, insecure } = await login({ serverUrl: 'https://music.example.com/app/', username: ' alice ', password: 'hunter2', fetch: server.fetch });
    expect(session.server.url).toBe('https://music.example.com');
    expect(session.credentials.username).toBe('alice');
    expect(session.user).toMatchObject({ username: 'alice', canDownload: true, isAdmin: false });
    expect(session.serverInfo).toMatchObject({ type: 'navidrome', openSubsonic: true, extensions: ['formPost', 'songLyrics'] });
    expect(insecure).toBe(false);
    // The password never goes over the wire.
    for (const call of server.calls) {
      expect(call.params.get('p')).toBeNull();
      expect(call.params.toString()).not.toContain('hunter2');
      expect(call.params.get('c')).toBe('Sonora');
    }
    expect(JSON.stringify(session)).not.toContain('hunter2');
  });

  it('rejects wrong passwords with an auth error', async () => {
    const server = mockServer({ password: 'right' });
    const err = await login({ serverUrl: 'https://x.test', username: 'a', password: 'wrong', fetch: server.fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(NavidromeError);
    expect(err.kind).toBe('auth');
    expect(err.code).toBe(40);
  });

  it('flags insecure http servers on public hosts', async () => {
    const server = mockServer();
    const res = await login({ serverUrl: 'http://music.example.com', username: 'a', password: 'secret', fetch: server.fetch });
    expect(res.insecure).toBe(true);
  });

  it('maps network failures and timeouts', async () => {
    const offline = await login({
      serverUrl: 'https://down.test',
      username: 'a',
      password: 'b',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    }).catch((e) => e);
    expect(offline.kind).toBe('network');

    const slow = await login({
      serverUrl: 'https://slow.test',
      username: 'a',
      password: 'b',
      timeoutMs: 20,
      fetch: (_u, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    }).catch((e) => e);
    expect(slow.kind).toBe('timeout');
  });

  it('detects servers that are not Subsonic compatible', async () => {
    const html = await login({
      serverUrl: 'https://example.test',
      username: 'a',
      password: 'b',
      fetch: async () => new Response('<html></html>', { status: 200 }),
    }).catch((e) => e);
    expect(html.kind).toBe('server');
  });

  it('validates input before any request', async () => {
    await expect(login({ serverUrl: 'ftp://x', username: 'a', password: 'b' })).rejects.toThrow(/http/);
    await expect(login({ serverUrl: 'https://x.test', username: '', password: 'b' })).rejects.toThrow(/username/);
  });
});
