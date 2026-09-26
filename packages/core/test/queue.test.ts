import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUEUE,
  append,
  buildQueue,
  clearUpcoming,
  currentItem,
  insertNext,
  jumpToUid,
  moveQueueItem,
  nextIndex,
  persistableQueue,
  previousIndex,
  removeItem,
  setShuffle,
} from '../src/queue';
import { seeded, song, songs } from './fixtures';

const ids = (q: { items: { song: { id: string } }[] }) => q.items.map((i) => i.song.id);

describe('queue', () => {
  it('builds a queue starting at the given index', () => {
    const q = buildQueue(songs(5), 2);
    expect(ids(q)).toEqual(['1', '2', '3', '4', '5']);
    expect(currentItem(q)?.song.id).toBe('3');
    expect(new Set(q.items.map((i) => i.uid)).size).toBe(5);
  });

  it('allows the same song twice with unique uids', () => {
    const q = append(buildQueue([song('a')]), [song('a')]);
    expect(ids(q)).toEqual(['a', 'a']);
    expect(q.items[0]?.uid).not.toBe(q.items[1]?.uid);
  });

  it('computes next/previous with repeat modes', () => {
    const q = { ...buildQueue(songs(3), 2) };
    expect(nextIndex(q, 'off')).toBe(-1);
    expect(nextIndex(q, 'all')).toBe(0);
    expect(nextIndex(q, 'one', true)).toBe(2);
    expect(nextIndex(q, 'one', false)).toBe(-1);
    const first = buildQueue(songs(3), 0);
    expect(previousIndex(first, 'off')).toBe(0);
    expect(previousIndex(first, 'all')).toBe(2);
    expect(nextIndex(EMPTY_QUEUE, 'all')).toBe(-1);
  });

  it('inserts "play next" right after the current item', () => {
    const q = insertNext(buildQueue(songs(3), 0), [song('x'), song('y')]);
    expect(ids(q)).toEqual(['1', 'x', 'y', '2', '3']);
    expect(q.items[1]?.manual).toBe(true);
    expect(currentItem(q)?.song.id).toBe('1');
  });

  it('appends to the end and starts an empty queue', () => {
    const q = append(EMPTY_QUEUE, [song('a'), song('b')]);
    expect(q.index).toBe(0);
    expect(ids(append(q, [song('c')]))).toEqual(['a', 'b', 'c']);
  });

  it('removes items and keeps the current pointer valid', () => {
    let q = buildQueue(songs(4), 2); // current = 3
    q = removeItem(q, q.items[0]!.uid);
    expect(currentItem(q)?.song.id).toBe('3');
    q = removeItem(q, currentItem(q)!.uid); // remove current -> next becomes current
    expect(currentItem(q)?.song.id).toBe('4');
    q = removeItem(q, currentItem(q)!.uid); // removing last -> previous
    expect(currentItem(q)?.song.id).toBe('2');
    q = removeItem(q, currentItem(q)!.uid);
    expect(q.index).toBe(-1);
    expect(q.items).toHaveLength(0);
  });

  it('moves items (drag & drop) while tracking the current one', () => {
    let q = buildQueue(songs(4), 1); // current = 2
    q = moveQueueItem(q, 1, 3);
    expect(ids(q)).toEqual(['1', '3', '4', '2']);
    expect(currentItem(q)?.song.id).toBe('2');
    q = moveQueueItem(q, 0, 2);
    expect(ids(q)).toEqual(['3', '4', '1', '2']);
    expect(q.index).toBe(3);
    expect(moveQueueItem(q, 0, 99)).toBe(q);
  });

  it('jumps to an item by uid', () => {
    const q = buildQueue(songs(3));
    expect(currentItem(jumpToUid(q, q.items[2]!.uid))?.song.id).toBe('3');
    expect(jumpToUid(q, 'missing')).toBe(q);
  });

  it('clears only upcoming items', () => {
    const q = clearUpcoming(buildQueue(songs(5), 1));
    expect(ids(q)).toEqual(['1', '2']);
    expect(q.index).toBe(1);
  });

  it('shuffles around the current track and restores the original order', () => {
    const base = buildQueue(songs(10), 4);
    const shuffled = setShuffle(base, true, seeded(7));
    expect(shuffled.shuffled).toBe(true);
    expect(shuffled.index).toBe(0);
    expect(currentItem(shuffled)?.song.id).toBe('5');
    expect(ids(shuffled).slice().sort()).toEqual(ids(base).slice().sort());
    expect(ids(shuffled)).not.toEqual(ids(base));

    // Songs added while shuffled survive unshuffle.
    const withExtra = insertNext(shuffled, [song('n')]);
    const restored = setShuffle(withExtra, false);
    expect(restored.shuffled).toBe(false);
    expect(ids(restored)).toEqual(['1', '2', '3', '4', '5', 'n', '6', '7', '8', '9', '10']);
    expect(currentItem(restored)?.song.id).toBe('5');
  });

  it('builds a shuffled queue that starts with the chosen song', () => {
    const q = buildQueue(songs(20), 7, { shuffle: true, random: seeded(3) });
    expect(currentItem(q)?.song.id).toBe('8');
    expect(q.index).toBe(0);
    expect(q.originalOrder).toHaveLength(20);
  });

  it('bounds persisted queues around the current item', () => {
    const q = buildQueue(songs(5000), 3000);
    const p = persistableQueue(q, 1000);
    expect(p.items).toHaveLength(1000);
    expect(currentItem(p)?.song.id).toBe('3001');
  });
});
