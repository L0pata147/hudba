import { useEffect, useState } from 'react';
import { FALLBACK_BACKDROP, type RGB } from '@sonora/ui';
import { artworkUrl, extractDominantColor } from '../lib/artwork';

export function useDominantColor(coverArtId: string | undefined): RGB {
  const [color, setColor] = useState<RGB>(FALLBACK_BACKDROP);
  useEffect(() => {
    const src = artworkUrl(coverArtId, 'thumb');
    if (!src) {
      setColor(FALLBACK_BACKDROP);
      return;
    }
    let alive = true;
    void extractDominantColor(src).then((c) => alive && setColor(c));
    return () => {
      alive = false;
    };
  }, [coverArtId]);
  return color;
}
