import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SmilePlus, X } from "lucide-react";
import {
  DEFAULT_RECENT_EMOJIS,
  EMOJI_CATEGORIES,
  filterEmojis,
  loadRecentEmojis,
  rememberEmoji,
  type EmojiCategory,
} from "@/lib/emoji";

export default function EmojiPicker({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (emoji: string) => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<EmojiCategory>("recent");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(DEFAULT_RECENT_EMOJIS);
  const emojis = useMemo(
    () => filterEmojis(category, query, recent),
    [category, query, recent]
  );

  useEffect(() => {
    setRecent(loadRecentEmojis(window.localStorage));
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    if (window.matchMedia("(pointer: fine)").matches)
      window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  async function selectEmoji(emoji: string) {
    setRecent(current => rememberEmoji(emoji, current, window.localStorage));
    setOpen(false);
    setQuery("");
    await onSelect(emoji);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={open ? "关闭表情面板" : "打开表情面板"}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={`grid h-8 w-8 place-items-center rounded-lg transition active:scale-95 disabled:opacity-40 ${open ? "bg-white text-teal-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-teal-600"}`}
      >
        <SmilePlus size={17} />
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="选择表情"
          className="absolute bottom-11 left-0 z-40 flex max-h-[min(28rem,56vh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
        >
          <header className="flex items-center gap-2 border-b border-slate-100 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value.slice(0, 30))}
                placeholder="搜索表情，如：开心、爱心"
                aria-label="搜索表情"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  aria-label="清空表情搜索"
                  onClick={() => setQuery("")}
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="关闭表情面板"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </header>

          <nav
            aria-label="表情分类"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2 [scrollbar-width:none]"
          >
            {EMOJI_CATEGORIES.map(item => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-pressed={!query && category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setQuery("");
                }}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg transition active:scale-95 ${!query && category === item.id ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-slate-100"}`}
              >
                {item.icon}
              </button>
            ))}
          </nav>

          <div className="min-h-32 flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-1 text-[11px] font-medium text-slate-400">
              {query
                ? `搜索结果 · ${emojis.length}`
                : EMOJI_CATEGORIES.find(item => item.id === category)?.label}
            </p>
            {emojis.length ? (
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-9">
                {emojis.map(item => (
                  <button
                    key={`${item.category}-${item.emoji}`}
                    type="button"
                    title={item.terms.split(" ")[0]}
                    aria-label={`发送表情 ${item.emoji}`}
                    onClick={() => selectEmoji(item.emoji)}
                    className="grid aspect-square min-h-9 place-items-center rounded-xl text-2xl transition hover:bg-teal-50 active:scale-90"
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid min-h-28 place-items-center text-center text-xs text-slate-400">
                <div>
                  <span className="block text-3xl">🔍</span>
                  <span className="mt-2 block">没有找到相关表情</span>
                </div>
              </div>
            )}
          </div>
          <footer className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
            点击表情将作为独立消息立即发送
          </footer>
        </section>
      )}
    </div>
  );
}
