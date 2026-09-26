import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';

interface SliderProps {
  value: number;
  max: number;
  /** Buffered amount (same unit as value) drawn behind the fill. */
  buffered?: number;
  onChange?: (value: number) => void;
  /** Called continuously while dragging (for previews). */
  onScrub?: (value: number | null) => void;
  label: string;
  valueText?: string;
  step?: number;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Custom accessible slider (progress + volume). Uses pointer capture for
 * smooth dragging and exposes role="slider" with keyboard support.
 */
export function Slider({ value, max, buffered, onChange, onScrub, label, valueText, step, className, disabled, size = 'sm' }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const safeMax = max > 0 ? max : 1;
  const shown = drag ?? value;
  const pct = Math.min(100, Math.max(0, (shown / safeMax) * 100));
  const bufPct = buffered != null ? Math.min(100, (buffered / safeMax) * 100) : 0;
  const keyStep = step ?? safeMax / 20;

  const valueAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return (Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))) * safeMax;
    },
    [safeMax],
  );

  return (
    <div
      className={clsx('group/slider relative flex touch-none items-center select-none', size === 'md' ? 'h-6' : 'h-4', disabled ? 'opacity-40' : 'cursor-pointer', className)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const v = valueAt(e.clientX);
        setDrag(v);
        onScrub?.(v);
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        const v = valueAt(e.clientX);
        setDrag(v);
        onScrub?.(v);
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        const v = valueAt(e.clientX);
        setDrag(null);
        onScrub?.(null);
        onChange?.(v);
      }}
      onPointerCancel={() => {
        setDrag(null);
        onScrub?.(null);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        let next: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(safeMax, value + keyStep);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, value - keyStep);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = safeMax;
        if (next !== null) {
          e.preventDefault();
          e.stopPropagation();
          onChange?.(next);
        }
      }}
    >
      <div
        ref={trackRef}
        className={clsx(
          'relative w-full overflow-hidden rounded-full bg-fg/15 transition-[height] duration-150',
          size === 'md' ? 'h-1.5 group-hover/slider:h-2' : 'h-1 group-hover/slider:h-1.5',
        )}
      >
        {bufPct > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-fg/15" style={{ width: `${bufPct}%` }} />}
        <div
          className={clsx('absolute inset-y-0 left-0 rounded-full', drag !== null ? 'bg-accent' : 'bg-fg group-hover/slider:bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={clsx(
          'pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow-md transition-opacity duration-150',
          drag !== null ? 'opacity-100' : 'opacity-0 group-hover/slider:opacity-100 group-focus-visible/slider:opacity-100',
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
