import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ExternalLink, LogOut } from 'lucide-react';
import type { AccentColor, Preferences, StreamQuality, ThemeMode } from '@sonora/types';
import { accents } from '@sonora/ui';
import { historyStore, preferencesStore, resetForLogout, useDownloads, usePreferences, useSession } from '@sonora/core';
import { formatBytes, pluralize } from '@sonora/utils';
import { Button } from '../components/ui/Button';
import { Select, Switch } from '../components/ui/Controls';
import { Slider } from '../components/ui/Slider';
import { idb } from '../lib/idb';
import { QUERY_CACHE_KEY } from '../lib/query-persist';
import { useUi } from '../lib/ui-store';
import { isTauri } from '../platform';
import { toast } from '@sonora/core';
import pkg from '../../package.json';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-surface px-5 py-4" aria-label={title}>
      <h2 className="mb-1 font-display text-[1.1rem] font-bold">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        {description && <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => preferencesStore.getState().set(k, v);

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek 10 seconds'],
  ['Shift + ← / →', 'Previous / next track'],
  ['Ctrl/⌘ + K', 'Search'],
  ['Ctrl/⌘ + L', 'Focus search'],
  ['M', 'Mute'],
  ['Q', 'Show queue'],
];

export function SettingsPage() {
  const prefs = usePreferences((s) => s);
  const session = useSession((s) => s.session);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openDialog = useUi((s) => s.openDialog);
  const records = useDownloads((s) => s.records);
  const downloads = useMemo(() => Object.values(records).filter((r) => r.status === 'done'), [records]);
  const [cacheSize, setCacheSize] = useState<number | null>(null);

  useEffect(() => {
    void idb.size(QUERY_CACHE_KEY).then(setCacheSize);
  }, []);

  const clearCache = async () => {
    qc.clear();
    await idb.del(QUERY_CACHE_KEY);
    setCacheSize(0);
    toast.success('Cache cleared');
    void qc.refetchQueries();
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-4 pb-10 md:pt-2">
      <h1 className="font-display text-[1.9rem] font-extrabold tracking-tight">Settings</h1>

      <Section title="Account">
        <Row label="Username">{session?.credentials.username}</Row>
        <Row label="Server" description={session?.serverInfo.serverVersion ? `Navidrome ${session.serverInfo.serverVersion}` : undefined}>
          <span className="max-w-[240px] truncate text-[14px] text-fg-2">{session?.server.url}</span>
        </Row>
        <Row label="Log out" description="Stops playback and removes the saved session from this device.">
          <Button variant="danger" size="sm" icon={<LogOut className="size-4" />} onClick={() => { resetForLogout(); void qc.clear(); }}>
            Log out
          </Button>
        </Row>
      </Section>

      <Section title="Playback">
        <Select<StreamQuality>
          label="Streaming quality"
          description="Lower bitrates are transcoded by the server and save bandwidth."
          value={prefs.streamQuality}
          onChange={(v) => set('streamQuality', v)}
          options={[
            { value: 'original', label: 'Original' },
            { value: '320', label: 'Very high (320 kbps)' },
            { value: '256', label: 'High (256 kbps)' },
            { value: '192', label: 'Normal (192 kbps)' },
            { value: '128', label: 'Data saver (128 kbps)' },
            { value: '96', label: 'Low (96 kbps)' },
          ]}
        />
        <Row label="Crossfade" description={prefs.crossfade ? `${prefs.crossfade} s between songs` : 'Off'}>
          <Slider label="Crossfade seconds" value={prefs.crossfade} max={12} step={1} valueText={`${prefs.crossfade} seconds`} onScrub={(v) => v !== null && set('crossfade', Math.round(v))} onChange={(v) => set('crossfade', Math.round(v))} className="w-40" />
        </Row>
        <Switch
          label="Gapless playback"
          description="Preloads the next track so transitions are near-gapless. Sample-accurate gapless is not available in the web audio element."
          checked={prefs.gapless}
          onChange={(v) => set('gapless', v)}
        />
        <Row label="Default volume" description="Used on first launch and after resetting settings.">
          <Slider label="Default volume" value={prefs.defaultVolume * 100} max={100} step={5} valueText={`${Math.round(prefs.defaultVolume * 100)}%`} onChange={(v) => set('defaultVolume', v / 100)} className="w-40" />
        </Row>
        <Switch label="Scrobble plays" description="Report plays to Navidrome (play counts, Last.fm / ListenBrainz if configured on the server)." checked={prefs.scrobble} onChange={(v) => set('scrobble', v)} />
        <Switch label="Sync queue with server" description="Save your queue and position on the server so you can resume on another device." checked={prefs.syncQueue} onChange={(v) => set('syncQueue', v)} />
      </Section>

      <Section title="Appearance">
        <Select<ThemeMode>
          label="Theme"
          value={prefs.theme}
          onChange={(v) => set('theme', v)}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
        <Row label="Accent color">
          <div role="radiogroup" aria-label="Accent color" className="flex gap-2">
            {(Object.keys(accents) as AccentColor[]).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={prefs.accent === a}
                aria-label={accents[a].name}
                title={accents[a].name}
                onClick={() => set('accent', a)}
                className={clsx('flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110', prefs.accent === a && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')}
                style={{ background: accents[a].base }}
              >
                {prefs.accent === a && <Check className="size-4" style={{ color: accents[a].on }} />}
              </button>
            ))}
          </div>
        </Row>
        <Switch label="Compact mode" description="Denser lists and slightly smaller text." checked={prefs.compactMode} onChange={(v) => set('compactMode', v)} />
      </Section>

      <Section title="Storage">
        <Row label="Library cache" description="Albums, artists and playlists cached for fast start-up and offline browsing.">
          <div className="flex items-center gap-3">
            <span className="text-[14px] text-fg-2">{cacheSize == null ? '…' : formatBytes(cacheSize)}</span>
            <Button size="sm" variant="outline" onClick={() => void clearCache()}>
              Clear cache
            </Button>
          </div>
        </Row>
        <Row label="Downloads" description={`${pluralize(downloads.length, 'song')} · ${formatBytes(downloads.reduce((t, r) => t + (r.bytes ?? 0), 0))}`}>
          <Button size="sm" variant="outline" onClick={() => navigate('/downloads')}>
            Manage
          </Button>
        </Row>
        <Row label="Listening history" description="Stored only on this device.">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              openDialog({ type: 'confirm', title: 'Clear history?', message: 'Removes local listening history.', confirmLabel: 'Clear', danger: true, onConfirm: () => historyStore.getState().clear() })
            }
          >
            Clear
          </Button>
        </Row>
      </Section>

      <Section title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-3 text-[14px]">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded bg-surface-active px-2 py-0.5 font-sans text-[12px] font-semibold">{k}</kbd>
              </dt>
              <dd className="text-fg-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="About">
        <Row label="Sonora" description={isTauri ? 'Desktop app' : 'Web app'}>
          <span className="text-[14px] text-fg-2">v{pkg.version}</span>
        </Row>
        <Row
          label="Navidrome compatibility"
          description={
            session
              ? `Subsonic API ${session.serverInfo.apiVersion}${session.serverInfo.openSubsonic ? ' + OpenSubsonic' : ''}${session.serverInfo.extensions.length ? ` (${session.serverInfo.extensions.join(', ')})` : ''}`
              : undefined
          }
        >
          <span className="text-[14px] text-fg-2">Navidrome ≥ 0.49</span>
        </Row>
        <Row label="Open-source licenses" description="React, TanStack Query & Virtual, Zustand, dnd-kit, Lucide (ISC), Inter & Plus Jakarta Sans (OFL), Tauri (MIT/Apache-2.0).">
          <a href="https://github.com/navidrome/navidrome" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[14px] font-semibold text-fg-2 hover:text-fg">
            Navidrome <ExternalLink className="size-3.5" />
          </a>
        </Row>
      </Section>
    </div>
  );
}
