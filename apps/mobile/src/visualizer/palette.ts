import { useEffect, useState } from 'react';
import { decode } from 'jpeg-js';
import { tryGetNavidrome } from '@sonora/core';
import { accents, hslToRgb, paletteFromPixels, rgbToHsl, type RGB } from '@sonora/ui';

const cache = new Map<string, [RGB, RGB]>();
/** Decoded 32×32 RGBA covers (for the pixel mosaic of the liquid style). */
const pixelCache = new Map<string, Uint8Array>();
const listeners = new Set<() => void>();

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** Accent colour plus a neighbouring hue, used until (or if) the artwork can't be read. */
export function accentPalette(accentHex: string = accents.ember.base): [RGB, RGB] {
  const { h } = rgbToHsl(hexToRgb(accentHex));
  return [hslToRgb(h, 0.95, 0.6), hslToRgb((h + 50) % 360, 0.95, 0.62)];
}

/** Two neon colours from the cover. Navidrome serves resized covers as JPEG, which jpeg-js decodes in JS. */
export async function extractPalette(coverArtId: string): Promise<[RGB, RGB] | null> {
  const hit = cache.get(coverArtId);
  if (hit) return hit;
  const url = tryGetNavidrome()?.media.coverArtUrl(coverArtId, 32);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not a JPEG
    const img = decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 2, maxMemoryUsageInMB: 32 });
    const pal = paletteFromPixels(img.data);
    cache.set(coverArtId, pal);
    if (img.width === 32 && img.height === 32) {
      pixelCache.set(coverArtId, img.data);
      listeners.forEach((l) => l());
    }
    return pal;
  } catch {
    return null;
  }
}

export function usePalette(coverArtId: string | undefined, accentHex: string): [RGB, RGB] {
  const [pal, setPal] = useState<[RGB, RGB]>(() => (coverArtId && cache.get(coverArtId)) || accentPalette(accentHex));
  useEffect(() => {
    let alive = true;
    setPal((coverArtId && cache.get(coverArtId)) || accentPalette(accentHex));
    if (coverArtId) void extractPalette(coverArtId).then((p) => alive && p && setPal(p));
    return () => {
      alive = false;
    };
  }, [coverArtId, accentHex]);
  return pal;
}

/** 16×16 average colours of the cover (null until the palette has been extracted). */
export function useCoverMosaic(coverArtId: string | undefined): string[] | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const px = coverArtId ? pixelCache.get(coverArtId) : undefined;
  if (!px) return null;
  const out: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const i = ((y * 2 + dy) * 32 + x * 2 + dx) * 4;
        r += px[i]!;
        g += px[i + 1]!;
        b += px[i + 2]!;
      }
      out.push(`rgb(${r >> 2},${g >> 2},${b >> 2})`);
    }
  }
  return out;
}
