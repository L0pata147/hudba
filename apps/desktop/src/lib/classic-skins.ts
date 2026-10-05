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

/* ---------- pictures behind the Winamp windows ---------- */

export type BackdropAnimation = 'groove' | 'pulse' | 'float' | 'none';

export interface SavedPicture {
  id: string;
  name: string;
  blob: Blob;
}

const PICTURES_KEY = 'classic.pictures';
const BACKDROP_KEY = 'classic.backdrop';

export async function loadPictures(): Promise<SavedPicture[]> {
  return (await idb.getValue<SavedPicture[]>(PICTURES_KEY)) ?? [];
}

export async function savePicture(file: File | Blob, name: string): Promise<SavedPicture> {
  const pic: SavedPicture = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, blob: file };
  await idb.setValue(PICTURES_KEY, [...(await loadPictures()), pic]);
  return pic;
}

export async function removePicture(id: string): Promise<void> {
  await idb.setValue(PICTURES_KEY, (await loadPictures()).filter((p) => p.id !== id));
}

export interface BackdropSettings {
  pictureId: string | null;
  animation: BackdropAnimation;
}

export async function loadBackdrop(): Promise<BackdropSettings> {
  return (await idb.getValue<BackdropSettings>(BACKDROP_KEY)) ?? { pictureId: null, animation: 'groove' };
}

export async function saveBackdrop(s: BackdropSettings): Promise<void> {
  await idb.setValue(BACKDROP_KEY, s);
}
