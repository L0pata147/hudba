import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Sparkles } from 'lucide-react';
import {
  DEFAULT_SMART_RULES,
  evaluateSmartPlaylist,
  SMART_SORTS,
  SMART_TEMPLATES,
  smartPlaylistsStore,
  useGenres,
  useLibrarySongs,
  type SmartRules,
  type SmartSort,
} from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { Chip } from '../ui/Controls';

type Days = 'any' | '7' | '30' | '90' | '180' | '365';
const DAYS: { value: Days; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '7', label: 'A week' },
  { value: '30', label: 'A month' },
  { value: '90', label: '3 months' },
  { value: '180', label: '6 months' },
  { value: '365', label: 'A year' },
];
const toDays = (n?: number): Days => (n != null && DAYS.some((d) => d.value === String(n)) ? (String(n) as Days) : 'any');
const fromDays = (d: Days) => (d === 'any' ? undefined : Number(d));

type Plays = 'any' | 'never' | 'played' | '5' | '20';
const PLAYS: { value: Plays; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'never', label: 'Never played' },
  { value: 'played', label: 'Played at least once' },
  { value: '5', label: '5+ plays' },
  { value: '20', label: '20+ plays' },
];
const toPlays = (r: SmartRules): Plays =>
  r.maxPlays === 0 ? 'never' : r.minPlays === 1 ? 'played' : r.minPlays === 5 ? '5' : r.minPlays === 20 ? '20' : 'any';
const fromPlays = (p: Plays): Pick<SmartRules, 'minPlays' | 'maxPlays'> =>
  p === 'never' ? { maxPlays: 0 } : p === 'played' ? { minPlays: 1 } : p === 'any' ? {} : { minPlays: Number(p) };

const LIMITS = ['25', '50', '100', '250', '500', '1000'] as const;
const yearOf = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v.trim()) : undefined);

/** A labelled drop-down, label above (fits two to a row). */
function Pick<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-fg-2">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-10 w-full appearance-none rounded-md bg-surface-hover pr-9 pl-3.5 text-[14px] font-medium text-fg outline-none hover:bg-surface-active focus-visible:ring-2 focus-visible:ring-accent"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-bg-elevated">
              {o.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute top-1/2 right-3.5 size-3 -translate-y-1/2 text-fg-2" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    </label>
  );
}

/** Create or edit a smart playlist; the number of matching songs updates as you change the rules. */
export function SmartPlaylistDialog({ id, onClose }: { id?: string; onClose: () => void }) {
  const existing = smartPlaylistsStore.getState().playlists.find((p) => p.id === id);
  const navigate = useNavigate();
  const genres = useGenres();
  const library = useLibrarySongs();
  const [name, setName] = useState(existing?.name ?? '');
  const [rules, setRules] = useState<SmartRules>(existing?.rules ?? DEFAULT_SMART_RULES);
  const [yearFrom, setYearFrom] = useState(existing?.rules.yearFrom?.toString() ?? '');
  const [yearTo, setYearTo] = useState(existing?.rules.yearTo?.toString() ?? '');
  const [genreFilter, setGenreFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<SmartRules>) => setRules((r) => ({ ...r, ...patch }));
  const effective: SmartRules = { ...rules, yearFrom: yearOf(yearFrom), yearTo: yearOf(yearTo) };

  const matches = useMemo(
    () => (library.data ? evaluateSmartPlaylist(library.data, { ...effective, sort: 'title', limit: 1_000_000 }).length : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.data, JSON.stringify(effective)],
  );
  const genreList = (genres.data ?? [])
    .filter((g) => g.name.toLowerCase().includes(genreFilter.trim().toLowerCase()) || rules.genres.includes(g.name))
    .sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0))
    .slice(0, 40);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give it a name.');
      return;
    }
    if (existing) {
      smartPlaylistsStore.getState().update(existing.id, { name, rules: effective });
    } else {
      const p = smartPlaylistsStore.getState().create(name, effective);
      navigate(`/smart/${p.id}`);
    }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={existing ? 'Edit smart playlist' : 'New smart playlist'} description="Picks songs from your whole library by these rules and keeps itself up to date." className="max-h-[calc(100vh-3rem)] max-w-2xl! overflow-y-auto">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!existing && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg-2">Start from</p>
            <div className="flex flex-wrap gap-2">
              {SMART_TEMPLATES.map((t) => (
                <Chip
                  key={t.name}
                  onClick={() => {
                    setRules(t.rules);
                    setYearFrom('');
                    setYearTo('');
                    if (!name.trim() || SMART_TEMPLATES.some((x) => x.name === name)) setName(t.name);
                  }}
                >
                  {t.name}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <TextField label="Name" icon={<Sparkles />} value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="My smart playlist" maxLength={120} error={error} data-autofocus />

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-fg-2">Genres {rules.genres.length ? `(${rules.genres.length})` : '(all)'}</p>
            <input
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              placeholder="Find a genre"
              aria-label="Find a genre"
              className="h-8 w-40 rounded-full bg-surface-hover px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {genreList.map((g) => {
              const on = rules.genres.includes(g.name);
              return (
                <Chip key={g.name} active={on} onClick={() => set({ genres: on ? rules.genres.filter((x) => x !== g.name) : [...rules.genres, g.name] })}>
                  {g.name}
                </Chip>
              );
            })}
            {genres.isPending && <span className="text-[13px] text-fg-3">Loading genres…</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <TextField size="md" label="Artist contains" value={rules.artist ?? ''} onChange={(e) => set({ artist: e.target.value })} placeholder="Any" />
          <TextField size="md" label="Year from" inputMode="numeric" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="1990" maxLength={4} />
          <TextField size="md" label="Year to" inputMode="numeric" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="1999" maxLength={4} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Pick
            label="Rating"
            value={String(rules.minRating ?? 'any')}
            onChange={(v) => set({ minRating: v === 'any' ? undefined : Number(v) })}
            options={[{ value: 'any', label: 'Any' }, ...[3, 4, 5].map((n) => ({ value: String(n), label: `${n}★ and more` }))]}
          />
          <Pick label="Plays" value={toPlays(rules)} onChange={(v) => set({ minPlays: undefined, maxPlays: undefined, ...fromPlays(v) })} options={PLAYS} />
          <Pick label="Added to the library within" value={toDays(rules.addedWithinDays)} onChange={(v) => set({ addedWithinDays: fromDays(v) })} options={DAYS} />
          <Pick label="Played within" value={toDays(rules.playedWithinDays)} onChange={(v) => set({ playedWithinDays: fromDays(v) })} options={DAYS} />
          <Pick label="Not played for" value={toDays(rules.notPlayedForDays)} onChange={(v) => set({ notPlayedForDays: fromDays(v) })} options={DAYS.map((d) => (d.value === 'any' ? { ...d, label: 'Doesn’t matter' } : d))} />
          <Pick label="Order" value={rules.sort} onChange={(v: SmartSort) => set({ sort: v })} options={SMART_SORTS.map((x) => ({ value: x.id, label: x.label }))} />
          <Pick
            label="At most"
            value={String(rules.limit) as (typeof LIMITS)[number]}
            onChange={(v) => set({ limit: Number(v) })}
            options={LIMITS.map((n) => ({ value: n, label: `${n} songs` }))}
          />
          <div className="flex items-end">
            <Chip active={rules.favoritesOnly} onClick={() => set({ favoritesOnly: !rules.favoritesOnly })}>
              Favorites only
            </Chip>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-[14px] text-fg-2" aria-live="polite">
            {matches == null ? 'Reading your library…' : matches === 0 ? 'No songs match yet' : `${pluralize(matches, 'song')} match${matches === 1 ? 'es' : ''}`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<Check className="size-4" />}>
              {existing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
