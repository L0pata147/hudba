import { NavLink } from 'react-router';
import clsx from 'clsx';
import { Home, Library, Search, Heart } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/favorites', label: 'Favorites', icon: Heart },
];

/** Bottom tab bar for the touch layout. */
export function MobileNav() {
  return (
    <nav aria-label="Main" className="safe-bottom border-t border-line bg-bg-elevated/95 backdrop-blur-lg">
      <ul className="flex h-16 items-stretch">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx('flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors active:scale-95', isActive ? 'text-fg' : 'text-fg-3')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.8} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
