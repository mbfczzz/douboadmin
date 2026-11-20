import type { Art } from "../../utils/ui-art";

// The 创作 entry page: four feature cards, then every feature tile (no
// 展开 / 收起). Each opens a page; `tab` ones switch tabs.
type Entry = { key: string; title: string; art: keyof Art; url: string; tab?: boolean; note?: string };

const create = (feature: string) => "/pages/create/index?feature=" + feature;
const preview = (key: string) => "/pages/feature/index?key=" + key;

export const CARDS: Entry[] = [
  { key: "video", title: "视频创作", note: "文字、图片生成视频", art: "hubVideo", url: "/pages/create/index?kind=video" },
  { key: "image", title: "图片创作", note: "文字、图片生成图片", art: "hubImage", url: "/pages/create/index?kind=image" },
  { key: "mix", title: "AI混剪", note: "多段素材合成一条", art: "hubMix", url: "/pages/mix/index" },
  { key: "remake", title: "一键复刻", note: "热门视频做同款", art: "hubRemake", url: "/pages/remake/index" },
];

export const TOOLS: Entry[] = [
  { key: "ad", title: "剧情带货", art: "toolAd", url: create("ad") },
  { key: "shop", title: "探店视频", art: "toolShop", url: create("shop") },
  { key: "avatar", title: "数字人", art: "toolAvatar", url: preview("avatar") },
  { key: "article", title: "图文成片", art: "toolArticle", url: preview("article") },
  { key: "sing", title: "视频唱歌", art: "toolSing", url: preview("sing") },
  { key: "remix", title: "视频二创", art: "toolRemix", url: preview("remix") },
  { key: "extract", title: "文案提取", art: "toolExtract", url: "/pages/extract/index" },
  { key: "idphoto", title: "AI证件照", art: "toolIdphoto", url: create("idphoto") },
  { key: "comic", title: "漫画推文", art: "toolComic", url: preview("comic") },
  { key: "works", title: "我的作品", art: "toolWorks", url: "/pages/works/index" },
  { key: "tasks", title: "生成记录", art: "toolTasks", url: "/pages/tasks/index" },
];

export const ENTRIES = [...CARDS, ...TOOLS];

// Picture per entry key, filled once the signed addresses arrive.
export function entryArt(art: Art) {
  const out: Record<string, string> = {};
  for (const e of ENTRIES) out[e.key] = art[e.art];
  return out;
}
