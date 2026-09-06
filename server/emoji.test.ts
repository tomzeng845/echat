import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECENT_EMOJIS,
  EMOJI_CATEGORIES,
  EMOJI_RECENT_STORAGE_KEY,
  filterEmojis,
  loadRecentEmojis,
  rememberEmoji,
} from "../client/src/lib/emoji";

describe("E聊 emoji messages", () => {
  it("filters emojis by Chinese or English keywords and category", () => {
    expect(
      filterEmojis("smileys", "", []).some(item => item.emoji === "😂")
    ).toBe(true);
    expect(
      filterEmojis("recent", "爱心", []).map(item => item.emoji)
    ).toContain("❤️");
    expect(filterEmojis("recent", "panda", []).map(item => item.emoji)).toEqual(
      ["🐼"]
    );
    expect(EMOJI_CATEGORIES.map(item => item.id)).toContain("recent");
  });

  it("deduplicates, limits and persists recently used emojis", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const recent = rememberEmoji("🎉", ["😂", "🎉", "❤️"], storage);

    expect(recent).toEqual(["🎉", "😂", "❤️"]);
    expect(JSON.parse(values.get(EMOJI_RECENT_STORAGE_KEY) || "[]")).toEqual(
      recent
    );
    expect(loadRecentEmojis(storage)).toEqual(recent);
    expect(loadRecentEmojis(null)).toEqual(DEFAULT_RECENT_EMOJIS);
  });
});
