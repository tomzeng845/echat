export type EmojiCategory =
  | "recent"
  | "smileys"
  | "gestures"
  | "animals"
  | "food"
  | "activities"
  | "travel"
  | "objects"
  | "symbols";

export type EmojiEntry = {
  emoji: string;
  category: Exclude<EmojiCategory, "recent">;
  terms: string;
};

export const EMOJI_CATEGORIES: Array<{
  id: EmojiCategory;
  label: string;
  icon: string;
}> = [
  { id: "recent", label: "最近使用", icon: "🕘" },
  { id: "smileys", label: "笑脸与人物", icon: "😀" },
  { id: "gestures", label: "手势与身体", icon: "👋" },
  { id: "animals", label: "动物与自然", icon: "🐼" },
  { id: "food", label: "食物与饮品", icon: "🍜" },
  { id: "activities", label: "活动与庆祝", icon: "🎉" },
  { id: "travel", label: "旅行与地点", icon: "🚗" },
  { id: "objects", label: "物品", icon: "💡" },
  { id: "symbols", label: "符号与爱心", icon: "❤️" },
];

const rows: Array<[Exclude<EmojiCategory, "recent">, string, string]> = [
  ["smileys", "😀", "开心 笑脸 smile happy"],
  ["smileys", "😃", "开心 大笑 smile happy"],
  ["smileys", "😄", "高兴 大笑 happy laugh"],
  ["smileys", "😁", "露齿笑 开心 grin"],
  ["smileys", "😂", "笑哭 眼泪 laugh tears"],
  ["smileys", "🤣", "笑翻 打滚 rofl"],
  ["smileys", "😊", "微笑 害羞 smile blush"],
  ["smileys", "😇", "天使 光环 angel"],
  ["smileys", "🙂", "微笑 smile"],
  ["smileys", "🙃", "倒脸 调皮 upside down"],
  ["smileys", "😉", "眨眼 wink"],
  ["smileys", "😍", "花痴 喜欢 爱 heart eyes"],
  ["smileys", "🥰", "喜爱 幸福 爱心 love"],
  ["smileys", "😘", "飞吻 亲亲 kiss"],
  ["smileys", "😋", "好吃 调皮 yummy"],
  ["smileys", "😎", "墨镜 酷 cool"],
  ["smileys", "🤓", "书呆子 眼镜 nerd"],
  ["smileys", "🤩", "星星眼 惊喜 star"],
  ["smileys", "🥳", "派对 庆祝 party"],
  ["smileys", "😏", "得意 smirk"],
  ["smileys", "😔", "难过 失落 sad"],
  ["smileys", "😢", "哭泣 难过 cry"],
  ["smileys", "😭", "大哭 眼泪 sob"],
  ["smileys", "😤", "生气 哼 angry"],
  ["smileys", "😡", "愤怒 生气 angry"],
  ["smileys", "🤯", "震惊 爆炸 mind blown"],
  ["smileys", "😱", "惊恐 尖叫 scream"],
  ["smileys", "🤗", "拥抱 hug"],
  ["smileys", "🤔", "思考 thinking"],
  ["smileys", "🤭", "捂嘴 偷笑 giggle"],
  ["smileys", "🤫", "安静 嘘 quiet"],
  ["smileys", "😴", "睡觉 困 sleep"],
  ["gestures", "👋", "挥手 再见 hello bye"],
  ["gestures", "🤚", "手掌 停止 raised hand"],
  ["gestures", "👌", "好的 ok"],
  ["gestures", "✌️", "胜利 耶 victory"],
  ["gestures", "🤞", "好运 交叉手指 luck"],
  ["gestures", "🤟", "爱你 手势 love you"],
  ["gestures", "🤘", "摇滚 rock"],
  ["gestures", "👍", "赞 好 同意 like yes"],
  ["gestures", "👎", "踩 不好 不同意 dislike no"],
  ["gestures", "👏", "鼓掌 applause"],
  ["gestures", "🙌", "庆祝 举手 hooray"],
  ["gestures", "👐", "张开双手 open hands"],
  ["gestures", "🤲", "双手 接住 palms"],
  ["gestures", "🙏", "谢谢 拜托 祈祷 thanks pray"],
  ["gestures", "💪", "加油 力量 muscle"],
  ["gestures", "🤝", "握手 合作 handshake"],
  ["gestures", "👀", "看 围观 eyes"],
  ["gestures", "🫶", "爱心手 heart hands"],
  ["gestures", "🫡", "敬礼 salute"],
  ["gestures", "🙇", "鞠躬 抱歉 bow sorry"],
  ["animals", "🐶", "狗 小狗 dog"],
  ["animals", "🐱", "猫 小猫 cat"],
  ["animals", "🐭", "老鼠 mouse"],
  ["animals", "🐹", "仓鼠 hamster"],
  ["animals", "🐰", "兔子 rabbit"],
  ["animals", "🦊", "狐狸 fox"],
  ["animals", "🐻", "熊 bear"],
  ["animals", "🐼", "熊猫 panda"],
  ["animals", "🐨", "考拉 koala"],
  ["animals", "🐯", "老虎 tiger"],
  ["animals", "🦁", "狮子 lion"],
  ["animals", "🐮", "牛 cow"],
  ["animals", "🐷", "猪 pig"],
  ["animals", "🐸", "青蛙 frog"],
  ["animals", "🐵", "猴子 monkey"],
  ["animals", "🐔", "鸡 chicken"],
  ["animals", "🐧", "企鹅 penguin"],
  ["animals", "🐦", "鸟 bird"],
  ["animals", "🦄", "独角兽 unicorn"],
  ["animals", "🌸", "花 樱花 flower"],
  ["animals", "🌞", "太阳 晴天 sun"],
  ["animals", "🌙", "月亮 晚安 moon"],
  ["food", "🍎", "苹果 apple"],
  ["food", "🍊", "橙子 orange"],
  ["food", "🍉", "西瓜 watermelon"],
  ["food", "🍓", "草莓 strawberry"],
  ["food", "🍒", "樱桃 cherry"],
  ["food", "🍔", "汉堡 burger"],
  ["food", "🍟", "薯条 fries"],
  ["food", "🍕", "披萨 pizza"],
  ["food", "🍜", "面条 拉面 noodles"],
  ["food", "🍚", "米饭 rice"],
  ["food", "🍣", "寿司 sushi"],
  ["food", "🍰", "蛋糕 cake"],
  ["food", "🎂", "生日蛋糕 birthday cake"],
  ["food", "🍫", "巧克力 chocolate"],
  ["food", "🍿", "爆米花 popcorn"],
  ["food", "☕", "咖啡 coffee"],
  ["food", "🍵", "茶 tea"],
  ["food", "🍺", "啤酒 beer"],
  ["food", "🥂", "干杯 cheers"],
  ["activities", "🎉", "庆祝 礼花 party"],
  ["activities", "🎊", "彩球 庆祝 confetti"],
  ["activities", "🎈", "气球 balloon"],
  ["activities", "🎁", "礼物 gift"],
  ["activities", "⚽", "足球 soccer"],
  ["activities", "🏀", "篮球 basketball"],
  ["activities", "🏓", "乒乓球 ping pong"],
  ["activities", "🎮", "游戏 game"],
  ["activities", "🎤", "唱歌 麦克风 karaoke"],
  ["activities", "🎧", "耳机 音乐 headphones"],
  ["activities", "🎬", "电影 movie"],
  ["activities", "🏆", "奖杯 冠军 trophy"],
  ["travel", "🚗", "汽车 开车 car"],
  ["travel", "🚕", "出租车 taxi"],
  ["travel", "🚌", "公交车 bus"],
  ["travel", "🚄", "高铁 火车 train"],
  ["travel", "✈️", "飞机 旅行 plane"],
  ["travel", "🚀", "火箭 rocket"],
  ["travel", "🚲", "自行车 bike"],
  ["travel", "🏠", "家 房子 home"],
  ["travel", "🏢", "公司 办公楼 office"],
  ["travel", "🏖️", "海滩 度假 beach"],
  ["travel", "🗻", "山 富士山 mountain"],
  ["travel", "🌍", "地球 世界 earth world"],
  ["objects", "📱", "手机 phone"],
  ["objects", "💻", "电脑 laptop"],
  ["objects", "⌚", "手表 watch"],
  ["objects", "📷", "相机 camera"],
  ["objects", "💡", "灯泡 想法 idea"],
  ["objects", "🔔", "铃铛 通知 bell"],
  ["objects", "🔑", "钥匙 key"],
  ["objects", "🔒", "锁 安全 lock"],
  ["objects", "📌", "图钉 pin"],
  ["objects", "📅", "日历 calendar"],
  ["objects", "✉️", "邮件 信封 mail"],
  ["objects", "💰", "钱 money"],
  ["symbols", "❤️", "红心 爱心 爱 love heart"],
  ["symbols", "🧡", "橙心 爱 orange heart"],
  ["symbols", "💛", "黄心 爱 yellow heart"],
  ["symbols", "💚", "绿心 爱 green heart"],
  ["symbols", "💙", "蓝心 爱 blue heart"],
  ["symbols", "💜", "紫心 爱 purple heart"],
  ["symbols", "🖤", "黑心 black heart"],
  ["symbols", "💔", "心碎 broken heart"],
  ["symbols", "💕", "两颗心 love"],
  ["symbols", "💯", "满分 一百分 hundred"],
  ["symbols", "✅", "完成 正确 check"],
  ["symbols", "❌", "错误 取消 cross"],
  ["symbols", "⚠️", "警告 warning"],
  ["symbols", "🔥", "火 热门 fire"],
  ["symbols", "✨", "闪亮 星星 sparkle"],
  ["symbols", "⭐", "星星 收藏 star"],
];

export const EMOJI_ENTRIES: EmojiEntry[] = rows.map(
  ([category, emoji, terms]) => ({ category, emoji, terms })
);

export const DEFAULT_RECENT_EMOJIS = [
  "😂",
  "❤️",
  "👍",
  "😊",
  "🎉",
  "🥰",
  "😭",
  "🙏",
];
export const EMOJI_RECENT_STORAGE_KEY = "echat.emoji.recent.v1";

export type EmojiStorage = Pick<Storage, "getItem" | "setItem">;

export function loadRecentEmojis(storage?: EmojiStorage | null): string[] {
  if (!storage) return DEFAULT_RECENT_EMOJIS;
  try {
    const parsed = JSON.parse(
      storage.getItem(EMOJI_RECENT_STORAGE_KEY) || "[]"
    );
    if (!Array.isArray(parsed)) return DEFAULT_RECENT_EMOJIS;
    const known = new Set(EMOJI_ENTRIES.map(item => item.emoji));
    const recent = parsed.filter(
      (value): value is string => typeof value === "string" && known.has(value)
    );
    return recent.length
      ? Array.from(new Set(recent)).slice(0, 24)
      : DEFAULT_RECENT_EMOJIS;
  } catch {
    return DEFAULT_RECENT_EMOJIS;
  }
}

export function rememberEmoji(
  emoji: string,
  recent: readonly string[],
  storage?: EmojiStorage | null
): string[] {
  const next = [emoji, ...recent.filter(item => item !== emoji)].slice(0, 24);
  try {
    storage?.setItem(EMOJI_RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full storage quota must not block sending.
  }
  return next;
}

export function filterEmojis(
  category: EmojiCategory,
  query: string,
  recent: readonly string[]
): EmojiEntry[] {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const lookup = new Map(EMOJI_ENTRIES.map(item => [item.emoji, item]));
  const source = normalized
    ? EMOJI_ENTRIES
    : category === "recent"
      ? recent
          .map(emoji => lookup.get(emoji))
          .filter((item): item is EmojiEntry => Boolean(item))
      : EMOJI_ENTRIES.filter(item => item.category === category);
  if (!normalized) return source;
  const terms = normalized.split(/\s+/).filter(Boolean);
  return source.filter(item => {
    const haystack = `${item.emoji} ${item.terms}`.toLocaleLowerCase("zh-CN");
    return terms.every(term => haystack.includes(term));
  });
}
