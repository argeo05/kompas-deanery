// Минимальная обёртка IndexedDB для офлайна (SPEC §6.13). Работает и на странице, и в service worker.
// Любая ошибка хранилища (приватный режим, квота, запрет) не ломает экран: чтение даёт undefined,
// запись молча пропускается.

const DB_NAME = "kompas";
const VERSION = 1;

export type StoreName = "data" | "outbox" | "meta";
const STORES: StoreName[] = ["data", "outbox", "meta"];

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES)
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Другая вкладка обновляет схему: закрываемся, следующий вызов откроет заново.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        opening = null;
        resolve(null);
      };
      req.onblocked = () => resolve(null);
    } catch {
      opening = null;
      resolve(null);
    }
  });
  return opening;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const idb = {
  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
  },
  async put(store: StoreName, key: string, value: unknown): Promise<void> {
    await run(store, "readwrite", (s) => s.put(value, key));
  },
  async delete(store: StoreName, key: string): Promise<void> {
    await run(store, "readwrite", (s) => s.delete(key));
  },
  async getAll<T>(store: StoreName): Promise<T[]> {
    return (await run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>)) ?? [];
  },
  async keys(store: StoreName): Promise<string[]> {
    const keys = await run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys());
    return (keys ?? []).map(String);
  },
  async clear(store: StoreName): Promise<void> {
    await run(store, "readwrite", (s) => s.clear());
  },
};
