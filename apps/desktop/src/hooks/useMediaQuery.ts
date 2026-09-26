import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below this width the app switches to the touch-first mobile layout. */
export const MOBILE_QUERY = '(max-width: 767px)';
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
