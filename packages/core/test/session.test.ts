import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { md5 } from '@sonora/utils';
import { configurePlatform, createMemoryStorage } from '../src/platform';
import { getNavidrome, recentServersStore, sessionStore } from '../src/session';

function fakeServer(password: string) {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    const p = url.searchParams;
    const ok = p.get('t') === md5(password + p.get('s'));
    const body = ok
      ? { status: 'ok', version: '1.16.1', type: 'navidrome', serverVersion: '0.64.2', openSubsonic: false, user: { username: p.get('u'), adminRole: true, streamRole: true } }
      : { status: 'failed', version: '1.16.1', error: { code: 40, message: 'Wrong username or password' } };
    return Response.json({ 'subsonic-response': body });
  });
}

describe('session store (authentication)', () => {
  const secure = createMemoryStorage();
  const storage = createMemoryStorage();

  beforeEach(() => {
    configurePlatform({ storage, secureStorage: secure, clientName: 'Sonora-test' });
    sessionStore.setState({ session: null });
    recentServersStore.setState({ servers: [] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('logs in, persists only a token to secure storage and remembers the server', async () => {
    vi.stubGlobal('fetch', fakeServer('s3cret'));
    const session = await sessionStore.getState().login({ serverUrl: 'https://music.example.com/', username: 'ana', password: 's3cret' });
    expect(session.user.isAdmin).toBe(true);
    const persisted = String(secure.getItem('sonora.session'));
    expect(persisted).toContain(session.credentials.token);
    expect(persisted).not.toContain('s3cret');
    expect(JSON.stringify(storage.dump())).not.toContain(session.credentials.token);
    expect(recentServersStore.getState().servers[0]).toMatchObject({ url: 'https://music.example.com', username: 'ana' });
    expect(getNavidrome().media.streamUrl('x')).toContain('c=Sonora-test');
  });

  it('keeps the user logged out on wrong credentials', async () => {
    vi.stubGlobal('fetch', fakeServer('right'));
    await expect(sessionStore.getState().login({ serverUrl: 'https://music.example.com', username: 'ana', password: 'wrong' })).rejects.toMatchObject({ kind: 'auth' });
    expect(sessionStore.getState().session).toBeNull();
    expect(() => getNavidrome()).toThrow(/Not signed in/);
  });

  it('forgets the server when "remember" is off and restores the session after restart', async () => {
    vi.stubGlobal('fetch', fakeServer('pw'));
    await sessionStore.getState().login({ serverUrl: 'http://192.168.1.2:4533', username: 'bo', password: 'pw', rememberServer: false });
    expect(recentServersStore.getState().servers).toHaveLength(0);
    const saved = sessionStore.getState().session;
    // Simulate an app restart: fresh in-memory state, same secure storage.
    const raw = String(secure.getItem('sonora.session'));
    sessionStore.setState({ session: null });
    secure.setItem('sonora.session', raw);
    await sessionStore.persist.rehydrate();
    expect(sessionStore.getState().session).toEqual(saved);
    sessionStore.getState().logout();
    expect(sessionStore.getState().session).toBeNull();
  });
});
