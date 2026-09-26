import { useId, type ReactNode } from 'react';
import clsx from 'clsx';

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  iconOnly?: boolean;
}

export function Segmented<T extends string>({ value, onChange, options, label, iconOnly }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-hover p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={clsx(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors [&>svg]:size-4',
              iconOnly ? 'w-9' : 'px-3.5',
              active ? 'bg-surface-active text-fg shadow-sm' : 'text-fg-2 hover:text-fg',
            )}
          >
            {o.icon}
            {!iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-fg text-bg' : 'bg-surface-hover text-fg hover:bg-surface-active',
      )}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-accent' : 'bg-surface-active')}
      >
        <span className={clsx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-soft', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, label, description }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>}
      </div>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-9 appearance-none rounded-full bg-surface-hover pr-9 pl-4 text-sm font-semibold text-fg outline-none hover:bg-surface-active focus-visible:ring-2 focus-visible:ring-accent"
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
      </div>
    </div>
  );
}
