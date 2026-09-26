/**
 * Pure, immutable play-queue operations shared by every platform.
 * All functions return a new `QueueState`; nothing here touches audio.
 */
import type { QueueItem, RepeatMode, Song } from '@sonora/types';
import { moveItem, randomString, shuffleArray } from '@sonora/utils';

export interface QueueState {
  items: QueueItem[];
  /** index of the current item, -1 when the queue is empty */
  index: number;
  shuffled: boolean;
  /** uids in their pre-shuffle order (null when not shuffled) */
  originalOrder: string[] | null;
}

export const EMPTY_QUEUE: QueueState = { items: [], index: -1, shuffled: false, originalOrder: null };

let uidCounter = 0;
export function createQueueItem(song: Song, manual = false): QueueItem {
  uidCounter = (uidCounter + 1) % 1_000_000;
  const item: QueueItem = { uid: `${uidCounter.toString(36)}${randomString(6)}`, song };
  if (manual) item.manual = true;
  return item;
}

export function currentItem(q: QueueState): QueueItem | undefined {
  return q.index >= 0 ? q.items[q.index] : undefined;
}

export function upcomingItems(q: QueueState): QueueItem[] {
  return q.items.slice(q.index + 1);
}

export function previousItems(q: QueueState): QueueItem[] {
  return q.index > 0 ? q.items.slice(0, q.index) : [];
}

function shuffleAround(items: QueueItem[], currentUid: string | undefined, random?: () => number): QueueItem[] {
  const current = items.find((i) => i.uid === currentUid);
  const rest = items.filter((i) => i.uid !== currentUid);
  const shuffled = shuffleArray(rest, random);
  return current ? [current, ...shuffled] : shuffled;
}

/** Replaces the queue with `songs`, starting at `startIndex`. */
export function buildQueue(
  songs: readonly Song[],
  startIndex = 0,
  opts: { shuffle?: boolean; random?: () => number } = {},
): QueueState {
  if (!songs.length) return { ...EMPTY_QUEUE, shuffled: Boolean(opts.shuffle) };
  const items = songs.map((s) => createQueueItem(s));
  const start = Math.min(Math.max(0, startIndex), items.length - 1);
  if (!opts.shuffle) return { items, index: start, shuffled: false, originalOrder: null };
  const originalOrder = items.map((i) => i.uid);
  return {
    items: shuffleAround(items, items[start]?.uid, opts.random),
    index: 0,
    shuffled: true,
    originalOrder,
  };
}

/**
 * Index to play after the current one, or -1 when playback should stop.
 * `auto` is true when the track ended by itself (repeat-one only applies then).
 */
export function nextIndex(q: QueueState, repeat: RepeatMode, auto = false): number {
  if (!q.items.length) return -1;
  if (auto && repeat === 'one') return q.index;
  if (q.index + 1 < q.items.length) return q.index + 1;
  return repeat === 'all' ? 0 : -1;
}

export function previousIndex(q: QueueState, repeat: RepeatMode): number {
  if (!q.items.length) return -1;
  if (q.index > 0) return q.index - 1;
  return repeat === 'all' ? q.items.length - 1 : 0;
}

export function jumpToIndex(q: QueueState, index: number): QueueState {
  if (index < 0 || index >= q.items.length) return q;
  return { ...q, index };
}

export function jumpToUid(q: QueueState, uid: string): QueueState {
  return jumpToIndex(q, q.items.findIndex((i) => i.uid === uid));
}

function insertIntoOriginal(order: string[] | null, afterUid: string | undefined, uids: string[]): string[] | null {
  if (!order) return null;
  const pos = afterUid ? order.indexOf(afterUid) : -1;
  const at = pos === -1 ? order.length : pos + 1;
  return [...order.slice(0, at), ...uids, ...order.slice(at)];
}

/** Inserts songs right after the current item ("Play next"). */
export function insertNext(q: QueueState, songs: readonly Song[]): QueueState {
  if (!songs.length) return q;
  const newItems = songs.map((s) => createQueueItem(s, true));
  if (q.index < 0) {
    return { ...q, items: [...q.items, ...newItems], index: q.items.length ? q.index : 0, originalOrder: q.originalOrder ? [...q.originalOrder, ...newItems.map((i) => i.uid)] : null };
  }
  const at = q.index + 1;
  return {
    ...q,
    items: [...q.items.slice(0, at), ...newItems, ...q.items.slice(at)],
    originalOrder: insertIntoOriginal(q.originalOrder, currentItem(q)?.uid, newItems.map((i) => i.uid)),
  };
}

/** Appends songs to the end of the queue ("Add to queue"). */
export function append(q: QueueState, songs: readonly Song[], manual = true): QueueState {
  if (!songs.length) return q;
  const newItems = songs.map((s) => createQueueItem(s, manual));
  return {
    ...q,
    items: [...q.items, ...newItems],
    index: q.index < 0 ? 0 : q.index,
    originalOrder: q.originalOrder ? [...q.originalOrder, ...newItems.map((i) => i.uid)] : null,
  };
}

/**
 * Removes an item. If it was the current item, the following item becomes
 * current (or the previous one when removing the last item).
 */
export function removeItem(q: QueueState, uid: string): QueueState {
  const idx = q.items.findIndex((i) => i.uid === uid);
  if (idx === -1) return q;
  const items = q.items.filter((i) => i.uid !== uid);
  let index = q.index;
  if (idx < q.index) index -= 1;
  else if (idx === q.index && index >= items.length) index = items.length - 1;
  return {
    ...q,
    items,
    index: items.length ? index : -1,
    originalOrder: q.originalOrder ? q.originalOrder.filter((u) => u !== uid) : null,
  };
}

/** Moves an item (drag & drop). The current item stays current. */
export function moveQueueItem(q: QueueState, from: number, to: number): QueueState {
  if (from === to || from < 0 || to < 0 || from >= q.items.length || to >= q.items.length) return q;
  const currentUid = currentItem(q)?.uid;
  const items = moveItem(q.items, from, to);
  const index = currentUid ? items.findIndex((i) => i.uid === currentUid) : q.index;
  return { ...q, items, index };
}

/** Removes everything after the current item. */
export function clearUpcoming(q: QueueState): QueueState {
  if (q.index < 0) return EMPTY_QUEUE;
  const items = q.items.slice(0, q.index + 1);
  const keep = new Set(items.map((i) => i.uid));
  return { ...q, items, originalOrder: q.originalOrder ? q.originalOrder.filter((u) => keep.has(u)) : null };
}

/**
 * Toggles shuffle. Turning it on keeps the current song playing and shuffles
 * everything else after it; turning it off restores the original order.
 */
export function setShuffle(q: QueueState, on: boolean, random?: () => number): QueueState {
  if (on === q.shuffled) return q;
  const currentUid = currentItem(q)?.uid;
  if (on) {
    if (!q.items.length) return { ...q, shuffled: true, originalOrder: [] };
    return {
      items: shuffleAround(q.items, currentUid, random),
      index: currentUid ? 0 : q.index,
      shuffled: true,
      originalOrder: q.items.map((i) => i.uid),
    };
  }
  const byUid = new Map(q.items.map((i) => [i.uid, i]));
  const restored: QueueItem[] = [];
  for (const uid of q.originalOrder ?? []) {
    const item = byUid.get(uid);
    if (item) {
      restored.push(item);
      byUid.delete(uid);
    }
  }
  for (const item of q.items) if (byUid.has(item.uid)) restored.push(item);
  const index = currentUid ? restored.findIndex((i) => i.uid === currentUid) : q.index;
  return { items: restored, index, shuffled: false, originalOrder: null };
}

/** Replaces song metadata in the queue (e.g. after a favorite toggle). */
export function updateSongs(q: QueueState, update: (song: Song) => Song): QueueState {
  let changed = false;
  const items = q.items.map((item) => {
    const song = update(item.song);
    if (song === item.song) return item;
    changed = true;
    return { ...item, song };
  });
  return changed ? { ...q, items } : q;
}

/** Bounded window of the queue for persistence (keeps huge queues cheap to store). */
export function persistableQueue(q: QueueState, max = 1000): QueueState {
  if (q.items.length <= max) return q;
  const before = Math.min(q.index, Math.floor(max / 4));
  const start = Math.max(0, q.index - before);
  const items = q.items.slice(start, start + max);
  const keep = new Set(items.map((i) => i.uid));
  return {
    items,
    index: q.index - start,
    shuffled: q.shuffled,
    originalOrder: q.originalOrder ? q.originalOrder.filter((u) => keep.has(u)) : null,
  };
}
