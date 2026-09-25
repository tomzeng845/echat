import { clearPersistedSession } from "./session-storage";

const VERSION_URL = "/echat-version.json";
const VERSION_KEY = "echat.frontend.version";
const RELOAD_KEY = "echat.frontend.version.reload";
const CHECK_INTERVAL_MS = 60_000;
let started = false;
let reloading = false;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Continue with the in-memory reload path.
  }
}

async function readServerVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { version?: unknown };
    return typeof payload.version === "string" && payload.version.trim()
      ? payload.version
      : null;
  } catch {
    // A temporary network failure must not log the user out.
    return null;
  }
}

async function clearClientCacheAndReload(version: string): Promise<void> {
  if (reloading) return;
  reloading = true;
  writeLocal(RELOAD_KEY, version);
  writeLocal(VERSION_KEY, version);

  // Remove the E聊 session from both localStorage and IndexedDB before reload.
  clearPersistedSession();
  try {
    sessionStorage.clear();
  } catch {
    // Storage may be blocked in a restricted WebView.
  }
  try {
    localStorage.removeItem("echat.admin.tenant");
  } catch {
    // Ignore restricted storage.
  }
  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    }
  } catch {
    // Cache Storage is optional; hashed assets remain safe after reload.
  }

  window.dispatchEvent(new Event("echat-session-expired"));
  const url = new URL(window.location.href);
  url.searchParams.set("_echat_v", version);
  window.location.replace(url.toString());
}

async function checkFrontendVersion(initial = false): Promise<void> {
  const serverVersion = await readServerVersion();
  if (!serverVersion) return;
  const localVersion = readLocal(VERSION_KEY);
  if (!initial && localVersion && localVersion !== serverVersion) {
    await clearClientCacheAndReload(serverVersion);
    return;
  }
  if (localVersion !== serverVersion) writeLocal(VERSION_KEY, serverVersion);
}

export function startFrontendVersionGuard(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void checkFrontendVersion(true);
  window.setInterval(() => void checkFrontendVersion(false), CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkFrontendVersion(false);
  });
}
