const avatarUrls = [
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/ReOJllDSmtIVEfgL.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/ZdCugrnWlMZnuyQn.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/ioHiqLWIxfhjZWBG.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cbkBVDUbIKXRemNK.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/KxUMPNpIIHnBXdsq.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/XzhECxqWzLZsHxeo.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/VLQKdvAPpEqxPpZt.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/AAaZwQCEHPHHfOpy.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/IomgLBOvISKQxQAD.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/axMAKFIAHkccOxHD.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/wIQNYAhpBNsGEpbE.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/bnKvoFtjRduybYyh.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/skMBUVqzAIaKZZli.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/SEeVUcEBWzIBYICg.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/huxbIQaTZCPqeNzW.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/QuavxGtaFTLwDyIr.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/pxvXjGcTQklKaexK.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/FAewNPnsEfxAMuLY.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/aGsKDQHWohSakJxg.jpg",
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/ZqmMKKIFsyVGRrSq.jpg",
] as const;

export const BUILTIN_AVATARS = avatarUrls.map((url, index) => ({
  id: `builtin-${String(index + 1).padStart(2, "0")}`,
  url,
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
