import { useId } from 'react';
import clsx from 'clsx';

/** Sonora mark: an open ring ("sound wave in orbit") around a solid core. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset="1" stopColor="#FF5C7A" />
        </linearGradient>
      </defs>
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke={`url(#${id}-g)`}
        strokeWidth="6"
        strokeDasharray="100 38"
        strokeLinecap="round"
        transform="rotate(-40 32 32)"
      />
      <circle cx="32" cy="32" r="9.5" fill={`url(#${id}-g)`} />
    </svg>
  );
}

export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2.5 select-none', className)}>
      <LogoMark size={30} />
      {!collapsed && <span className="font-display text-[1.35rem] font-extrabold tracking-tight">sonora</span>}
    </div>
  );
}
