const configuredApiBase = String(import.meta.env.VITE_ECHAT_API_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");

export function apiUrl(path: string) {
  if (!configuredApiBase || /^https?:\/\//i.test(path)) return path;
  return `${configuredApiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiBaseUrl = configuredApiBase;
