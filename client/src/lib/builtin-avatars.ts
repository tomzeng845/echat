export const BUILTIN_AVATARS = [
  ["builtin-01", "/manus-storage/pasted_file_C5eszb_20_3211b61e.jpg"],
  ["builtin-02", "/manus-storage/pasted_file_a1V8KH_0_5a96aacb.jpg"],
  ["builtin-03", "/manus-storage/pasted_file_clqjop_6_ea4b8958.jpg"],
  ["builtin-04", "/manus-storage/pasted_file_mIv2iA_7_a31471f2.jpg"],
  ["builtin-05", "/manus-storage/pasted_file_at9inA_8_5ca9474e.jpg"],
  ["builtin-06", "/manus-storage/pasted_file_nz3n8A_9_1362cc07.jpg"],
  ["builtin-07", "/manus-storage/pasted_file_OJVXjU_1_f52fd63b.jpg"],
  ["builtin-08", "/manus-storage/pasted_file_RN2rju_10_d2c5ebd1.jpg"],
  ["builtin-09", "/manus-storage/pasted_file_3LCXLJ_2_7a54115f.jpg"],
  ["builtin-10", "/manus-storage/pasted_file_i0sJkg_3_674693af.jpg"],
  ["builtin-11", "/manus-storage/pasted_file_htjVhn_11_bb528f2f.jpg"],
  ["builtin-12", "/manus-storage/pasted_file_HlPMPM_4_74993878.jpg"],
  ["builtin-13", "/manus-storage/pasted_file_wd5zfk_12_655a7c53.jpg"],
  ["builtin-14", "/manus-storage/pasted_file_lBqR4z_13_31d5d5cc.jpg"],
  ["builtin-15", "/manus-storage/pasted_file_tlrDQm_5_d86c9c0a.jpg"],
  ["builtin-16", "/manus-storage/pasted_file_IP3QiH_14_526f12da.jpg"],
  ["builtin-17", "/manus-storage/pasted_file_jVjFgN_15_13c8b493.jpg"],
  ["builtin-18", "/manus-storage/pasted_file_qxM2OL_16_ae854521.jpg"],
  ["builtin-19", "/manus-storage/pasted_file_NVqApD_17_20621341.jpg"],
  ["builtin-20", "/manus-storage/pasted_file_X1n1MF_18_19725bff.jpg"],
].map(([id, url]) => ({ id, url }));

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
