import type { Building } from "../../types/building";

const DB_NAME = "sunspotted";
const STORE_NAME = "buildings";
const DB_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedEntry {
  key: string;
  buildings: Building[];
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedBuildings(
  cacheKey: string,
): Promise<Building[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const entry = req.result as CachedEntry | undefined;
        if (entry && Date.now() - entry.timestamp < TTL_MS) {
          resolve(entry.buildings);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedBuildings(
  cacheKey: string,
  buildings: Building[],
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const entry: CachedEntry = { key: cacheKey, buildings, timestamp: Date.now() };
    store.put(entry);
  } catch {
    // Silently fail — cache is optional
  }
}

export async function clearExpiredBuildings(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const entry = cursor.value as CachedEntry;
        if (Date.now() - entry.timestamp >= TTL_MS) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch {
    // Silently fail
  }
}
