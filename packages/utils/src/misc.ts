export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Random alphanumeric string, using crypto when available. */
export function randomString(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffleArray<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Moves an element within a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const arr = items.slice();
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item as T);
  return arr;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...(lastArgs as A));
    }, wait);
  }) as Debounced<A>;
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  debounced.flush = () => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      timer = undefined;
      fn(...lastArgs);
    }
  };
  return debounced;
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number): (...args: A) => void {
  let last = 0;
  let trailing: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!trailing) {
      trailing = setTimeout(() => {
        trailing = undefined;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
