import { create } from 'zustand';
import { idb } from './idb';

/** How a character moves to the music. */
export type DanceStyle = 'groove' | 'bounce' | 'headbang' | 'sway';

export const DANCES: { id: DanceStyle; name: string }[] = [
  { id: 'groove', name: 'Groove' },
  { id: 'bounce', name: 'Bounce' },
  { id: 'headbang', name: 'Headbang' },
  { id: 'sway', name: 'Sway' },
];

/** Where the character dances: on a neon stage, or in a monitor it reaches out of. */
export type DancerScene = 'stage' | 'monitor';

export const SCENES: { id: DancerScene; name: string }[] = [
  { id: 'stage', name: 'Stage' },
  { id: 'monitor', name: 'Monitor' },
];

export interface SavedCharacter {
  id: string;
  name: string;
  /** PNG with a transparent background, trimmed to the figure */
  blob: Blob;
}

const LIST = 'visualizer.characters';
const CURRENT = 'visualizer.character';
/** Longest side of a stored character, px. */
const MAX_SIDE = 1400;

/* ------------------------------------------------------------------ */
/* Preparing a picture: background removal and trimming                */
/* ------------------------------------------------------------------ */

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not a picture'));
    };
    img.src = url;
  });
}

/**
 * Removes a plain background: when the corners share one colour, everything
 * connected to them within a tolerance becomes transparent (with a soft edge).
 * Pictures that are already transparent are left alone. Returns whether
 * anything was removed.
 */
export function removePlainBackground(px: Uint8ClampedArray, w: number, h: number, tolerance = 48): boolean {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (corners.some((i) => px[i + 3]! < 250)) return false;
  const [r0, g0, b0] = [px[corners[0]!]!, px[corners[0]! + 1]!, px[corners[0]! + 2]!];
  const dist = (i: number) => Math.abs(px[i]! - r0) + Math.abs(px[i + 1]! - g0) + Math.abs(px[i + 2]! - b0);
  if (corners.some((i) => dist(i) > tolerance)) return false;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const c of corners) {
    const p = c / 4;
    if (!seen[p]) {
      seen[p] = 1;
      queue[tail++] = p;
    }
  }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % w;
    const y = (p - x) / w;
    const d = dist(p * 4);
    // Soft edge: pixels close to the tolerance keep part of their alpha.
    px[p * 4 + 3] = d < tolerance * 0.6 ? 0 : Math.round((255 * (d - tolerance * 0.6)) / (tolerance * 0.4));
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of next) {
      if (q < 0 || seen[q]) continue;
      seen[q] = 1;
      if (dist(q * 4) <= tolerance) queue[tail++] = q;
    }
  }
  return true;
}

/** Bounding box of the visible pixels (alpha > 12), or null when empty. */
export function opaqueBounds(px: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Turns any picture into a dancer: plain background removed, trimmed to the figure, PNG. */
export async function prepareCharacter(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  removePlainBackground(data.data, w, h);
  const box = opaqueBounds(data.data, w, h) ?? { x: 0, y: 0, w, h };
  g.putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  out.getContext('2d')!.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the picture'))), 'image/png'));
}

export const characterNameFromFile = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Character';

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

interface CharactersState {
  loaded: boolean;
  list: SavedCharacter[];
  currentId: string | null;
  dance: DanceStyle;
  scene: DancerScene;
  /** decoded picture of the current character, for the renderer */
  image: HTMLImageElement | null;
  load(): Promise<void>;
  add(files: FileList | File[]): Promise<number>;
  remove(id: string): Promise<void>;
  select(id: string | null): Promise<void>;
  setDance(d: DanceStyle): Promise<void>;
  setScene(s: DancerScene): Promise<void>;
}

const persistCurrent = (s: { currentId: string | null; dance: DanceStyle; scene: DancerScene }) =>
  idb.setValue(CURRENT, { id: s.currentId, dance: s.dance, scene: s.scene });

/**
 * The dancer characters kept in IndexedDB, the selected one and its dance.
 * The selected character's picture is decoded once and shared with the renderer.
 */
export const useCharacters = create<CharactersState>()((set, get) => {
  let objectUrl: string | null = null;
  const decode = async (id: string | null) => {
    const ch = get().list.find((c) => c.id === id);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    if (!ch) {
      set({ image: null });
      return;
    }
    objectUrl = URL.createObjectURL(ch.blob);
    const img = new Image();
    img.src = objectUrl;
    try {
      await img.decode();
      if (get().currentId === id) set({ image: img });
    } catch {
      set({ image: null });
    }
  };
  return {
    loaded: false,
    list: [],
    currentId: null,
    dance: 'groove',
    scene: 'stage',
    image: null,
    async load() {
      if (get().loaded) return;
      const [list, cur] = await Promise.all([
        idb.getValue<SavedCharacter[]>(LIST),
        idb.getValue<{ id: string | null; dance: DanceStyle; scene?: DancerScene }>(CURRENT),
      ]);
      const chars = list ?? [];
      const id = cur?.id && chars.some((c) => c.id === cur.id) ? cur.id : (chars[0]?.id ?? null);
      set({
        loaded: true,
        list: chars,
        currentId: id,
        dance: DANCES.some((d) => d.id === cur?.dance) ? cur!.dance : 'groove',
        scene: SCENES.some((x) => x.id === cur?.scene) ? cur!.scene! : 'stage',
      });
      await decode(id);
    },
    async add(files) {
      const pics = [...files].filter((f) => f.type.startsWith('image/'));
      let last: SavedCharacter | null = null;
      for (const f of pics) {
        const blob = await prepareCharacter(f);
        last = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: characterNameFromFile(f.name), blob };
        set({ list: [...get().list, last] });
      }
      await idb.setValue(LIST, get().list);
      if (last) await get().select(last.id);
      return pics.length;
    },
    async remove(id) {
      const list = get().list.filter((c) => c.id !== id);
      set({ list });
      await idb.setValue(LIST, list);
      if (get().currentId === id) await get().select(list[0]?.id ?? null);
    },
    async select(id) {
      set({ currentId: id });
      await persistCurrent(get());
      await decode(id);
    },
    async setDance(dance) {
      set({ dance });
      await persistCurrent(get());
    },
    async setScene(scene) {
      set({ scene });
      await persistCurrent(get());
    },
  };
});
