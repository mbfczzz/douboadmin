import { tab, openPage, openTab, login, error, isNavigating } from "../../utils/api";
import { featureClick } from "../../services/analytics";
import { showArt } from "../../utils/ui-art";
import { pullRefresh } from "../../utils/refresh";
import { CARDS, TOOLS, ENTRIES, entryArt } from "./entries";
import { loadKeywords, loadVideos, cancelFeed } from "./feed";
import type { FeedVideo } from "./feed";

// 创作 tab: entry cards (视频/图片创作, AI混剪, 一键复刻), shortcut tiles,
// and a hot-video feed whose "做同款" opens 一键复刻 with that video.
Page({
  data: {
    cards: CARDS,
    tools: TOOLS,
    art: {} as Record<string, string>,
    feedState: "ready",
    keywords: [] as string[],
    keyword: "",
    videos: [] as FeedVideo[],
    loading: true,
    hasMore: false,
    feedError: "",
  },
  onShow() {
    tab(this, 2);
    showArt(this, (art) => ({ art: entryArt(art) }));
    // Returning keeps the loaded feed and scroll; pull down refreshes. A
    // sign-in elsewhere turns the login prompt into the feed.
    if (!this.data.videos.length || this.data.feedState === "login") void loadKeywords(this);
  },
  onHide() {
    cancelFeed(this);
    if (this.data.loading) this.setData({ loading: false });
  },
  onUnload() {
    cancelFeed(this);
  },
  onPullDownRefresh() {
    void pullRefresh(() => loadKeywords(this));
  },
  onReachBottom() {
    if (this.data.feedState === "ready") void loadVideos(this, true);
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const entry = ENTRIES.find((item) => item.key === e.currentTarget.dataset.key);
    if (!entry || isNavigating(this)) return;
    featureClick(entry.key);
    if (entry.tab) openTab(this, entry.url);
    else openPage(this, { url: entry.url });
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    const keyword = e.currentTarget.dataset.word as string;
    if (this.data.feedState !== "ready") return void this.signIn();
    if (keyword === this.data.keyword && this.data.videos.length) return;
    this.setData({ keyword });
    void loadVideos(this, false);
  },
  retry() {
    void (this.data.keywords.length ? loadVideos(this, false) : loadKeywords(this));
  },
  async signIn() {
    try {
      await login();
      await loadKeywords(this);
    } catch (e) {
      error(e);
    }
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    featureClick("hot");
    openPage(this, { url: "/pages/hot-detail/index?id=" + e.currentTarget.dataset.id });
  },
  remake(e: WechatMiniprogram.TouchEvent) {
    openPage(this, { url: "/pages/remake/index?id=" + e.currentTarget.dataset.id });
  },
});
