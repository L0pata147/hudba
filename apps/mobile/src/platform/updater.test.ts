import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ versionCode: 10 as number | undefined }));
const startActivityAsync = vi.fn(async (..._a: unknown[]) => ({ resultCode: 0 }));
const downloadFileAsync = vi.fn(async (_url: string, dest: { name: string }) => ({ ...dest, contentUri: `content://app/${dest.name}` }));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({ default: { get expoConfig() { return { version: '0.2.10', android: { versionCode: env.versionCode } }; } } }));
vi.mock('expo-intent-launcher', () => ({ startActivityAsync }));
vi.mock('expo-file-system', () => {
  class Directory {
    exists = false;
    constructor(..._p: unknown[]) {}
    create() {}
    delete() {}
  }
  class File {
    name: string;
    constructor(_d: unknown, name: string) {
      this.name = name;
    }
    static downloadFileAsync = downloadFileAsync;
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

const { useUpdater } = await import('./updater');

function serve(manifest: object | null) {
  globalThis.fetch = vi.fn(async () => (manifest ? new Response(JSON.stringify(manifest)) : new Response('', { status: 404 }))) as typeof fetch;
}

describe('android updater', () => {
  beforeEach(() => {
    env.versionCode = 10;
    useUpdater.setState({ status: 'idle', version: null, error: null, dismissed: false, progress: 0 });
    startActivityAsync.mockClear();
  });

  it('offers a build with a higher versionCode and installs it through the system installer', async () => {
    serve({ version: '0.2.12', versionCode: 12, url: 'https://x/Sonora-Android.apk' });
    await useUpdater.getState().check();
    expect(useUpdater.getState()).toMatchObject({ status: 'available', version: '0.2.12' });
    await useUpdater.getState().install();
    expect(downloadFileAsync).toHaveBeenCalledWith('https://x/Sonora-Android.apk', expect.anything(), expect.anything());
    expect(startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://app/Sonora-12.apk',
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  });

  it('says up to date for the same or an older build', async () => {
    serve({ version: '0.2.10', versionCode: 10, url: 'u' });
    await useUpdater.getState().check();
    expect(useUpdater.getState().status).toBe('none');
  });

  it('stays quiet at start-up when offline or nothing is published, but reports a manual check', async () => {
    serve(null);
    await useUpdater.getState().check({ quiet: true });
    expect(useUpdater.getState().status).toBe('idle');
    await useUpdater.getState().check();
    expect(useUpdater.getState()).toMatchObject({ status: 'error', error: 'HTTP 404' });
  });

  it('never updates a development build', async () => {
    env.versionCode = undefined;
    serve({ version: '0.2.12', versionCode: 12, url: 'u' });
    await useUpdater.getState().check({ quiet: true });
    expect(useUpdater.getState().status).toBe('idle');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
