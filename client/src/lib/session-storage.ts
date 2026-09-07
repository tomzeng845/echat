const DB_NAME = "echat-session-store";
const STORE_NAME = "session";
export const SESSION_KEY = "echat.session.v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export function readLocalSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function writeLocalSession(raw: string): void {
  try {
    localStorage.setItem(SESSION_KEY, raw);
  } catch {
    // IndexedDB mirror is still used below.
  }
}

export function clearLocalSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage may be unavailable in a restricted WebView.
  }
}

export async function readIndexedDbSession(): Promise<string | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(SESSION_KEY);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  } catch {
    return null;
  }
}

export async function writeIndexedDbSession(raw: string | null): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
      const request = raw === null ? store.delete(SESSION_KEY) : store.put(raw, SESSION_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
    });
  } catch {
    // Best-effort fallback for WebViews without IndexedDB.
  }
}

export function persistSession(raw: string): void {
  writeLocalSession(raw);
  void writeIndexedDbSession(raw);
}

export function clearPersistedSession(): void {
  clearLocalSession();
  void writeIndexedDbSession(null);
}

export async function restorePersistedSession(): Promise<string | null> {
  const local = readLocalSession();
  if (local) {
    void writeIndexedDbSession(local);
    return local;
  }
  const mirrored = await readIndexedDbSession();
  if (mirrored) writeLocalSession(mirrored);
  return mirrored;
}

export function isTransientNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /network|fetch|failed to fetch|timeout/i.test(error.message));
}
