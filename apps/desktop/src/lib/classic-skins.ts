import { create } from 'zustand';
import { idb } from './idb';

/** Winamp 2.x skins (.wsz) the user loaded into classic mode, kept in IndexedDB. */
export interface SavedSkin {
  id: string;
  name: string;
  blob: Blob;
}

const SKINS_KEY = 'classic.skins';
const CURRENT_KEY = 'classic.currentSkin';

export async function loadSavedSkins(): Promise<SavedSkin[]> {
  return (await idb.getValue<SavedSkin[]>(SKINS_KEY)) ?? [];
}

export async function saveSkin(file: File | Blob, name: string): Promise<SavedSkin> {
  const skins = await loadSavedSkins();
  const existing = skins.find((s) => s.name === name);
  const skin: SavedSkin = { id: existing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, blob: file };
  await idb.setValue(SKINS_KEY, [...skins.filter((s) => s.id !== skin.id), skin]);
  return skin;
}

export async function removeSkin(id: string): Promise<void> {
  await idb.setValue(SKINS_KEY, (await loadSavedSkins()).filter((s) => s.id !== id));
  if ((await currentSkinId()) === id) await setCurrentSkinId(null);
}

export async function currentSkinId(): Promise<string | null> {
  return (await idb.getValue<string | null>(CURRENT_KEY)) ?? null;
}

export async function setCurrentSkinId(id: string | null): Promise<void> {
  await idb.setValue(CURRENT_KEY, id);
}

export const skinNameFromFile = (name: string) => name.replace(/\.(wsz|zip)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Skin';

/** Whether the classic (Winamp 2.x) player is open. */
export const useClassicMode = create<{ open: boolean; setOpen(open: boolean): void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
