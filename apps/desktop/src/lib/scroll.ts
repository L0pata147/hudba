import { createContext, useContext } from 'react';

/** The main scrolling element (content pane), used by virtualized lists. */
export const ScrollContext = createContext<React.RefObject<HTMLElement | null> | null>(null);

export function useScrollElement(): React.RefObject<HTMLElement | null> {
  const ctx = useContext(ScrollContext);
  if (!ctx) throw new Error('useScrollElement must be used inside the app shell');
  return ctx;
}
