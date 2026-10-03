import { useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { EqualizerSettings } from '@sonora/types';
import {
  EQ_FREQUENCIES,
  EQ_MAX_DB,
  EQ_PRESETS,
  equalizerFromPreset,
  formatFrequency,
  normalizeEqualizer,
  preferencesStore,
  usePreferences,
} from '@sonora/core';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useEqualizerStatus } from '../../platform/equalizer-status';

const HEIGHT = 168;

function save(next: Partial<EqualizerSettings>) {
  const cur = preferencesStore.getState().equalizer;
  preferencesStore.getState().set('equalizer', normalizeEqualizer({ ...cur, ...next }));
}

/** Vertical dB slider (pointer, touch and keyboard). Double-click resets to 0 dB. */
function BandSlider({ value, label, onChange, disabled }: { value: number; label: string; onChange: (db: number) => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = (value + EQ_MAX_DB) / (2 * EQ_MAX_DB); // 0 bottom … 1 top
  const fromPointer = (clientY: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return value;
    const t = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    return Math.round((t * 2 * EQ_MAX_DB - EQ_MAX_DB) * 2) / 2;
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={clsx('h-4 text-[10px] tabular-nums sm:text-[11px]', value === 0 ? 'text-fg-3' : 'text-fg')}>
        {value > 0 ? `+${value}` : value}
      </span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={-EQ_MAX_DB}
        aria-valuemax={EQ_MAX_DB}
        aria-valuenow={value}
        aria-valuetext={`${value > 0 ? '+' : ''}${value} dB`}
        aria-disabled={disabled || undefined}
        className={clsx('group/band relative w-6 cursor-pointer touch-none select-none sm:w-8', disabled && 'opacity-60')}
        style={{ height: HEIGHT }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          onChange(fromPointer(e.clientY));
        }}
        onPointerMove={(e) => dragging && onChange(fromPointer(e.clientY))}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 3 : 0.5;
          const map: Record<string, number> = {
            ArrowUp: value + step,
            ArrowRight: value + step,
            ArrowDown: value - step,
            ArrowLeft: value - step,
            PageUp: value + 3,
            PageDown: value - 3,
            Home: EQ_MAX_DB,
            End: -EQ_MAX_DB,
            '0': 0,
          };
          if (e.key in map) {
            e.preventDefault();
            e.stopPropagation();
            onChange(Math.min(EQ_MAX_DB, Math.max(-EQ_MAX_DB, map[e.key]!)));
          }
        }}
      >
        <div className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-fg/12" />
        <div className="absolute left-1/2 h-px w-4 -translate-x-1/2 bg-fg/30" style={{ top: '50%' }} aria-hidden />
        <div
          className="absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-accent"
          style={value >= 0 ? { bottom: '50%', height: `${(pct - 0.5) * 100}%` } : { top: '50%', height: `${(0.5 - pct) * 100}%` }}
        />
        <div
          className={clsx(
            'absolute left-1/2 h-3.5 w-5 -translate-x-1/2 translate-y-1/2 rounded-[5px] bg-fg shadow-md ring-accent transition-transform group-focus-visible/band:ring-2 sm:w-7',
            dragging && 'scale-110',
          )}
          style={{ bottom: `${pct * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-fg-2 sm:text-[11px]">{label}</span>
    </div>
  );
}

/** Smooth curve through the band values, drawn behind the sliders. */
function ResponseCurve({ bands, active }: { bands: number[]; active: boolean }) {
  const w = 100;
  const pts = bands.map((db, i) => [((i + 0.5) / bands.length) * w, ((EQ_MAX_DB - db) / (2 * EQ_MAX_DB)) * HEIGHT] as const);
  let d = `M 0 ${pts[0]![1]} L ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  d += ` L ${w} ${pts.at(-1)![1]}`;
  return (
    <svg viewBox={`0 0 ${w} ${HEIGHT}`} preserveAspectRatio="none" className="pointer-events-none absolute top-6 left-0 w-full" style={{ height: HEIGHT }} aria-hidden>
      <path d={`${d} L ${w} ${HEIGHT} L 0 ${HEIGHT} Z`} fill="var(--accent)" opacity={active ? 0.1 : 0.04} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={active ? 0.9 : 0.35} />
    </svg>
  );
}

export function EqualizerPanel() {
  const eq = usePreferences((s) => s.equalizer);
  const status = useEqualizerStatus((s) => s.status);
  const unavailable = status === 'unavailable';
  const setBand = (i: number, db: number) => {
    const bands = eq.bands.slice();
    bands[i] = db;
    // Editing a band turns the EQ on and detaches it from the preset name.
    save({ bands, enabled: true, preset: null });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={eq.enabled}
          aria-label="Equalizer"
          disabled={unavailable}
          onClick={() => save({ enabled: !eq.enabled })}
          className="flex items-center gap-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <span className={clsx('relative h-6 w-11 rounded-full transition-colors duration-200', eq.enabled ? 'bg-accent' : 'bg-surface-active')}>
            <span className={clsx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-soft', eq.enabled && 'translate-x-5')} />
          </span>
          <span className={eq.enabled ? 'text-fg' : 'text-fg-2'}>{eq.enabled ? 'On' : 'Off'}</span>
        </button>
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          Preset
          <select
            value={eq.preset ?? ''}
            onChange={(e) => e.target.value && preferencesStore.getState().set('equalizer', equalizerFromPreset(e.target.value))}
            className="h-8 rounded-full bg-surface-hover px-3 text-[13px] font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {eq.preset === null && <option value="">Custom</option>}
            {Object.keys(EQ_PRESETS).map((name) => (
              <option key={name} value={name} className="bg-bg-elevated">
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => save({ bands: EQ_PRESETS.Flat, preamp: 0, preset: 'Flat' })}>
          Reset
        </Button>
      </div>

      {unavailable && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-warning/12 p-3 text-[13px] text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Your server (or a proxy in front of it) does not allow cross-origin audio, so the equalizer cannot process the stream. Playback is not affected.
        </p>
      )}

      <div className="flex items-start gap-2 overflow-x-auto pb-1 sm:gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2 border-r border-line pr-2 sm:pr-4">
          <BandSlider value={eq.preamp} label="Preamp" disabled={!eq.enabled} onChange={(db) => save({ preamp: db, enabled: true })} />
        </div>
        <div className="flex shrink-0 flex-col justify-between pt-6 text-right text-[10px] text-fg-3 tabular-nums max-sm:hidden" style={{ height: HEIGHT + 24 }} aria-hidden>
          <span>+{EQ_MAX_DB}</span>
          <span>0</span>
          <span>−{EQ_MAX_DB}</span>
        </div>
        <div className="relative flex min-w-max flex-1 justify-between gap-0.5 sm:gap-1">
          <ResponseCurve bands={eq.bands} active={eq.enabled} />
          {EQ_FREQUENCIES.map((hz, i) => (
            <BandSlider key={hz} value={eq.bands[i] ?? 0} label={formatFrequency(hz)} disabled={!eq.enabled} onChange={(db) => setBand(i, db)} />
          ))}
        </div>
      </div>
      <p className="text-[12px] text-fg-3">Drag a band or use the arrow keys (Shift = 3 dB steps). Double-click resets a band. Settings are saved on this device.</p>
    </div>
  );
}

export function EqualizerDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Equalizer" className="!max-w-[620px]">
      <EqualizerPanel />
    </Dialog>
  );
}
