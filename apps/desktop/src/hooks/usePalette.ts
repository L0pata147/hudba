import { useEffect, useState } from 'react';
import type { RGB } from '@sonora/ui';
import { artworkUrl, extractPalette } from '../lib/artwork';

const DEFAULT: [RGB, RGB] = [{ r: 245, g: 245, b: 250 }, { r: 150, g: 200, b: 255 }];

export function usePalette(coverArtId: string | undefined): [RGB, RGB] {
  const [pal, setPal] = useState<[RGB, RGB]>(DEFAULT);
  useEffect(() => {
    const src = artworkUrl(coverArtId, 'thumb');
    if (!src) return setPal(DEFAULT);
    let alive = true;
    void extractPalette(src).then((p) => alive && setPal(p));
    return () => {
      alive = false;
    };
  }, [coverArtId]);
  return pal;
}
