import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Session } from '@sonora/types';
import { createNavidromeClient, login as apiLogin, type LoginInput, type NavidromeClient } from '@sonora/api';
import { lazySecureStorage, lazyStorage, platform } from './platform';

export interface RecentServer {
  url: string;
  username: string;
  lastUsed: string;
}

export interface SessionState {
  session: Session | null;
  /** true once persisted session has been read from storage */
  hydrated: boolean;
  /** Set when the last login reached the server over plain http on a public network. */
  insecureConnection: boolean;
  login(input: Omit<LoginInput, 'clientName'> & { rememberServer?: boolean }): Promise<Session>;
  logout(): void;
}

export const sessionStore = createStore<SessionState>()(
  persist(
    (set) => ({
      session: null,
      hydrated: false,
      insecureConnection: false,
      async login(input) {
        const { session, insecure } = await apiLogin({ ...input, clientName: platform().clientName });
        set({ session, insecureConnection: insecure });
        if (input.rememberServer !== false) {
          recentServersStore.getState().remember({ url: session.server.url, username: session.credentials.username });
        } else {
          recentServersStore.getState().forget(session.server.url);
        }
        return session;
      },
      logout() {
        set({ session: null, insecureConnection: false });
      },
    }),
    {
      name: 'sonora.session',
      version: 1,
      storage: createJSONStorage(() => lazySecureStorage),
      partialize: (s) => ({ session: s.session, insecureConnection: s.insecureConnection }),
      skipHydration: true,
      onRehydrateStorage: () => () => {
        sessionStore.setState({ hydrated: true });
      },
    },
  ),
);

interface RecentServersState {
  servers: RecentServer[];
  remember(entry: { url: string; username: string }): void;
  forget(url: string): void;
}

/** "Remember server" — only URL + username, never credentials. */
export const recentServersStore = createStore<RecentServersState>()(
  persist(
    (set) => ({
      servers: [],
      remember(entry) {
        set((s) => ({
          servers: [
            { ...entry, lastUsed: new Date().toISOString() },
            ...s.servers.filter((x) => x.url !== entry.url),
          ].slice(0, 5),
        }));
      },
      forget(url) {
        set((s) => ({ servers: s.servers.filter((x) => x.url !== url) }));
      },
    }),
    { name: 'sonora.servers', storage: createJSONStorage(() => lazyStorage), skipHydration: true },
  ),
);

let cached: { session: Session; client: NavidromeClient } | null = null;

/** Returns the API client for the current session (memoized per session). */
export function getNavidrome(): NavidromeClient {
  const session = sessionStore.getState().session;
  if (!session) throw new Error('Not signed in');
  if (cached?.session !== session) {
    cached = { session, client: createNavidromeClient({ session, clientName: platform().clientName }) };
  }
  return cached.client;
}

export function tryGetNavidrome(): NavidromeClient | null {
  return sessionStore.getState().session ? getNavidrome() : null;
}
