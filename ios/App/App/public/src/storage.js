// Preserve the current session if device storage is unavailable or full.
export function createGameStorage(getStorage = () => globalThis.localStorage) {
  const pending = new Map();
  const cached = new Map();
  return {
    getItem(key) {
      if (pending.has(key)) return pending.get(key);
      try {
        const value = getStorage().getItem(key);
        cached.set(key, value);
        return value;
      } catch {
        return cached.get(key) ?? null;
      }
    },
    setItem(key, value) {
      const text = String(value);
      cached.set(key, text);
      pending.set(key, text);
      try {
        getStorage().setItem(key, text);
        pending.delete(key);
      } catch {
        // Keep newer in-memory data ahead of an older persisted value.
      }
    }
  };
}

export function readSavedInteger(storage, key, fallback = 0) {
  const value = Number(storage.getItem(key));
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export const gameStorage = createGameStorage();
