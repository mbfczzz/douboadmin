import { request, hasSession } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import type { HotResult } from "../../services/hot-video";

// The 创作 page's video feed: the hot-video keywords become chips, and the
// chosen one lists its videos in two columns ("做同款" opens 一键复刻).
// `state` is "off" when the Douyin source is not configured, "login" when
// the visitor must sign in first (searching needs an account).
export type FeedVideo = ReturnType<typeof hotView>;
type FeedPage = {
  data: { keywords: string[]; keyword: string; videos: FeedVideo[]; loading: boolean; hasMore: boolean };
  setData(data: Record<string, unknown>): void;
};
type Cursor = { revision: number; cursor: number; searchId: string; backtrace: string };
const cursors = new WeakMap<object, Cursor>();

function cursorOf(page: object) {
  let c = cursors.get(page);
  if (!c) cursors.set(page, (c = { revision: 0, cursor: 0, searchId: "", backtrace: "" }));
  return c;
}

export function cancelFeed(page: object) {
  cursorOf(page).revision++;
}

export async function loadKeywords(page: FeedPage) {
  const c = cursorOf(page), revision = ++c.revision;
  try {
    const d = await request<{ enabled: boolean; keywords: string[] }>("/hot/discovery", "GET", undefined, undefined, false);
    if (revision !== c.revision) return;
    if (!d.enabled || !d.keywords.length) return page.setData({ feedState: "off", loading: false });
    if (!hasSession()) return page.setData({ feedState: "login", keywords: d.keywords, loading: false });
    const keyword = d.keywords.includes(page.data.keyword) ? page.data.keyword : d.keywords[0];
    page.setData({ feedState: "ready", keywords: d.keywords, keyword });
    await loadVideos(page, false);
  } catch (e) {
    if (revision === c.revision) page.setData({ feedError: (e as Error).message, loading: false });
  }
}

export async function loadVideos(page: FeedPage, append: boolean) {
  const c = cursorOf(page);
  if (append && (page.data.loading || !page.data.hasMore)) return;
  if (!append) Object.assign(c, { cursor: 0, searchId: "", backtrace: "" });
  const revision = ++c.revision;
  page.setData({ loading: true, feedError: "", ...(append ? {} : { videos: [], hasMore: false }) });
  try {
    // history=0: browsing the feed is not a search of the visitor's own.
    const q = `?q=${encodeURIComponent(page.data.keyword)}&cursor=${c.cursor}&searchId=${encodeURIComponent(c.searchId)}&backtrace=${encodeURIComponent(c.backtrace)}&history=0`;
    const r = await request<HotResult>("/hot/videos" + q);
    if (revision !== c.revision) return;
    Object.assign(c, { cursor: r.cursor, searchId: r.searchId, backtrace: r.backtrace });
    const old = append ? page.data.videos : [];
    const ids = new Set(old.map((v) => v.id));
    page.setData({ videos: [...old, ...r.items.filter((v) => !ids.has(v.id)).map(hotView)], hasMore: r.hasMore });
  } catch (e) {
    if (revision === c.revision) page.setData({ feedError: (e as Error).message });
  } finally {
    if (revision === c.revision) page.setData({ loading: false });
  }
}
