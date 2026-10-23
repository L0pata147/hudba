import clsx from 'clsx';

/** The bars of the Overtone mark: a spectrum visualizer mid-song, each bar in its own colour. */
const BARS = [
  { x: 12, h: 16, color: '#5CFFC8' },
  { x: 22, h: 30, color: '#5CE1FF' },
  { x: 32, h: 42, color: '#5C9BFF' },
  { x: 42, h: 24, color: '#8B6BFF' },
  { x: 52, h: 34, color: '#C25CFF' },
];

/** Overtone mark: five visualizer bars, mint to violet. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      {BARS.map((b) => (
        <rect key={b.x} x={b.x - 3.2} y={53 - b.h} width="6.4" height={b.h} rx="3.2" fill={b.color} />
      ))}
    </svg>
  );
}

export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2.5 select-none', className)}>
      <LogoMark size={30} />
      {!collapsed && <span className="font-display text-[1.35rem] font-extrabold tracking-tight">overtone</span>}
    </div>
  );
}
