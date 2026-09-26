/** Minimal promise-based IndexedDB key/value store (used for the query cache). */
const DB_NAME = 'sonora';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  get: (key: string) => tx<string | undefined>('readonly', (s) => s.get(key) as IDBRequest<string | undefined>).catch(() => undefined),
  set: (key: string, value: string) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined).catch(() => undefined),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined).catch(() => undefined),
  size: async (key: string) => ((await idb.get(key)) ?? '').length,
};
