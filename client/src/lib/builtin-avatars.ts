const palettes = [
  ["#0f766e", "#5eead4", "#ccfbf1"],
  ["#1d4ed8", "#93c5fd", "#dbeafe"],
  ["#7e22ce", "#d8b4fe", "#f3e8ff"],
  ["#be123c", "#fda4af", "#ffe4e6"],
  ["#c2410c", "#fdba74", "#ffedd5"],
  ["#047857", "#86efac", "#dcfce7"],
  ["#4338ca", "#a5b4fc", "#e0e7ff"],
  ["#a16207", "#fde047", "#fef9c3"],
  ["#0369a1", "#7dd3fc", "#e0f2fe"],
  ["#9f1239", "#f9a8d4", "#fce7f3"],
  ["#166534", "#bef264", "#ecfccb"],
  ["#6d28d9", "#c4b5fd", "#ede9fe"],
  ["#155e75", "#67e8f9", "#cffafe"],
  ["#9a3412", "#fb923c", "#ffedd5"],
  ["#1e40af", "#60a5fa", "#dbeafe"],
  ["#86198f", "#f0abfc", "#fae8ff"],
  ["#365314", "#a3e635", "#ecfccb"],
  ["#713f12", "#facc15", "#fef3c7"],
  ["#115e59", "#2dd4bf", "#ccfbf1"],
  ["#7f1d1d", "#f87171", "#fee2e2"],
] as const;

function makeAvatar(index: number, colors: readonly [string, string, string]) {
  const angle = (index * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="256" height="256" rx="72" fill="${colors[2]}"/><circle cx="128" cy="128" r="96" fill="url(#g)"/><circle cx="82" cy="94" r="22" fill="${colors[2]}" opacity=".9"/><circle cx="174" cy="94" r="22" fill="${colors[2]}" opacity=".9"/><path d="M70 164c18 38 98 38 116 0" fill="none" stroke="${colors[2]}" stroke-width="18" stroke-linecap="round"/><path d="M39 54c20-30 58-43 89-43M217 54c-20-30-58-43-89-43" fill="none" stroke="${colors[1]}" stroke-width="12" stroke-linecap="round" opacity=".75"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const BUILTIN_AVATARS = palettes.map((colors, index) => ({
  id: `builtin-${String(index + 1).padStart(2, "0")}`,
  url: makeAvatar(index, colors),
}));

export const DEFAULT_BUILTIN_AVATAR = BUILTIN_AVATARS[0];

export function resolveBuiltinAvatar(source?: string | null) {
  if (!source) return DEFAULT_BUILTIN_AVATAR.url;
  if (source.startsWith("builtin://")) {
    return (
      BUILTIN_AVATARS.find(
        item => item.id === source.slice("builtin://".length)
      )?.url ?? DEFAULT_BUILTIN_AVATAR.url
    );
  }
  return source;
}

export function builtinAvatarSource(id: string) {
  return BUILTIN_AVATARS.some(item => item.id === id)
    ? `builtin://${id}`
    : "builtin://builtin-01";
}
