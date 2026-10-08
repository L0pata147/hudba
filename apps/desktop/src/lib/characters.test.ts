import { describe, expect, it } from 'vitest';
import { opaqueBounds, removePlainBackground } from './characters';

/** w × h picture filled with `bg`, with a `fg` block at (x, y, bw, bh). */
function picture(w: number, h: number, bg: number[], fg: number[], box: [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= box[0] && x < box[0] + box[2] && y >= box[1] && y < box[1] + box[3];
      px.set(inside ? fg : bg, (y * w + x) * 4);
    }
  return px;
}

describe('character pictures', () => {
  it('removes a plain background connected to the corners and keeps the figure', () => {
    const px = picture(20, 30, [250, 240, 245, 255], [200, 40, 120, 255], [5, 8, 10, 20]);
    expect(removePlainBackground(px, 20, 30)).toBe(true);
    expect(px[3]).toBe(0); // corner
    expect(px[(15 * 20 + 10) * 4 + 3]).toBe(255); // figure
    expect(opaqueBounds(px, 20, 30)).toEqual({ x: 5, y: 8, w: 10, h: 20 });
  });

  it('leaves transparent and busy pictures alone', () => {
    const clear = picture(10, 10, [0, 0, 0, 0], [255, 0, 0, 255], [2, 2, 4, 4]);
    expect(removePlainBackground(clear, 10, 10)).toBe(false);
    const busy = picture(10, 10, [10, 10, 10, 255], [255, 255, 255, 255], [0, 0, 5, 10]);
    expect(removePlainBackground(busy, 10, 10)).toBe(false);
  });
});
