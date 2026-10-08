/**
 * Safe access to the browser's localStorage.
 *
 * localStorage can be missing or throw: private windows, blocked site data, storage quota
 * errors, or server-side rendering. Every function here swallows those failures and reports
 * them through its return value, so the app keeps working (just without saving).
 *
 * Only two kinds of data are ever written, by src/lib/settings.ts and src/lib/progress.ts:
 * accessibility preferences, and scenario progress (ids and numbers). Never text a person wrote.
 */

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    // Some browsers expose localStorage but throw on use (storage disabled).
    const probe = "intheirshoes:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** Reads and parses JSON. Returns null if storage is unavailable, the key is empty, or the value is corrupt. */
export function readJson(key: string): unknown {
  try {
    const raw = getStorage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Returns true only if the value was really saved. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Returns true if the key is gone (or was never there), false if storage could not be used. */
export function removeKey(key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function storageAvailable(): boolean {
  return getStorage() !== null;
}
