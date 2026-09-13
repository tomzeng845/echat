import { apiUrl } from "./runtime-config";

export const BUILTIN_AVATARS = Array.from({ length: 20 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    id: `builtin-${number}`,
    url: apiUrl(`/builtin-avatars/builtin-${number}.jpg`),
  };
});

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
