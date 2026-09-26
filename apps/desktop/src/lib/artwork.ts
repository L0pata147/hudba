import { tryGetNavidrome } from '@sonora/core';
import { FALLBACK_BACKDROP, toBackdropColor, type RGB } from '@sonora/ui';

/** Artwork sizes we request, so the server-side resize cache is well reused. */
export const ART_SIZES = { thumb: 96, card: 300, hero: 600, full: 1000 } as const;
export type ArtSize = keyof typeof ART_SIZES;

export function artworkUrl(coverArtId: string | undefined, size: ArtSize = 'card'): string | undefined {
  const px = ART_SIZES[size] * (typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? 2 : 1);
  return tryGetNavidrome()?.media.coverArtUrl(coverArtId, Math.min(px, 1200));
}

const colorCache = new Map<string, RGB>();

/**
 * Extracts a representative color from artwork by averaging a downsampled
 * canvas, weighting saturated pixels more so gray borders do not dominate.
 */
export function extractDominantColor(src: string): Promise<RGB> {
  const cached = colorCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(FALLBACK_BACKDROP);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i]!;
          const pg = data[i + 1]!;
          const pb = data[i + 2]!;
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const sat = max === 0 ? 0 : (max - min) / max;
          const brightness = max / 255;
          const w = 0.15 + sat * 2 * (brightness > 0.12 && brightness < 0.95 ? 1 : 0.2);
          r += pr * w;
          g += pg * w;
          b += pb * w;
          total += w;
        }
        const color = toBackdropColor({ r: r / total, g: g / total, b: b / total });
        colorCache.set(src, color);
        resolve(color);
      } catch {
        resolve(FALLBACK_BACKDROP);
      }
    };
    img.onerror = () => resolve(FALLBACK_BACKDROP);
    img.src = src;
  });
}
