import clsx from 'clsx';
import { Check } from 'lucide-react';
import { SKINS, type Skin } from '@sonora/ui';
import { preferencesStore, usePreferences } from '@sonora/core';

const PREVIEW_FONT: Record<Skin['displayFont'], string> = {
  sans: "'Plus Jakarta Sans Variable', sans-serif",
  serif: 'Georgia, serif',
  mono: "'VT323', monospace",
  condensed: "'Bahnschrift Condensed', 'Arial Narrow', Impact, sans-serif",
  rounded: "'Trebuchet MS', Tahoma, sans-serif",
  pixel: "'Silkscreen', monospace",
};

/** A tiny mock of the app in the skin's colours and fonts. */
function Preview({ skin }: { skin: Skin }) {
  const r = (px: number) => `${px * skin.radius}px`;
  return (
    <div className="relative h-24 overflow-hidden" style={{ background: `linear-gradient(180deg, ${skin.background.join(', ')})` }} aria-hidden>
      <div className="absolute inset-y-2 left-2 w-9" style={{ background: skin.colors.surface, borderRadius: r(6) }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mx-1.5 mt-2 h-1.5" style={{ background: i ? skin.colors.textMuted : skin.accent.base, borderRadius: r(2), opacity: i ? 0.6 : 1 }} />
        ))}
      </div>
      <div className="absolute inset-y-2 right-2 left-13 p-2" style={{ background: skin.colors.bgElevated, borderRadius: r(6) }}>
        <div
          className="truncate text-[15px] leading-none font-bold"
          style={{ color: skin.colors.textPrimary, fontFamily: PREVIEW_FONT[skin.displayFont], textTransform: skin.uppercase ? 'uppercase' : undefined }}
        >
          {skin.name}
        </div>
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="size-7" style={{ background: i === 1 ? skin.accent.soft : skin.colors.surfaceHover, borderRadius: r(4) }} />
          ))}
          <div className="ml-auto size-7 rounded-full" style={{ background: skin.accent.base }} />
        </div>
      </div>
    </div>
  );
}

export function SkinPicker() {
  const current = usePreferences((s) => s.skin);
  return (
    <div role="radiogroup" aria-label="Skin" className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-3">
      {SKINS.map((skin) => {
        const active = current === skin.id || (!SKINS.some((s) => s.id === current) && skin.id === 'sonora');
        return (
          <button
            key={skin.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={skin.name}
            onClick={() => preferencesStore.getState().set('skin', skin.id)}
            className={clsx(
              'group overflow-hidden rounded-md bg-surface-hover text-left ring-2 transition-transform hover:-translate-y-0.5 focus-visible:outline-none',
              active ? 'ring-accent' : 'ring-transparent hover:ring-line',
            )}
          >
            <Preview skin={skin} />
            <div className="flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{skin.name}</p>
                <p className="line-clamp-2 text-[12px] text-fg-2">{skin.description}</p>
              </div>
              {active && <Check className="mt-0.5 size-4 shrink-0 text-accent" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
