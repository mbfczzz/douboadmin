import { request, error, enterPage, media, RequestError } from "../../utils/api";
import { resultImages } from "../../services/result-images";
import { freshUrl, noteIssued } from "../../utils/view-cache";
interface Work {
  title: string;
  kind: string;
  result: string;
  results?: string[];
  prompt?: string;
}
Page({
  data: { work: null as Work | null, loading: true, loadError: "" },
  token: "",
  revision: 0,
  loaded: false,
  onLoad(o: Record<string, string>) {
    this.token = o.token || "";
  },
  // Back from a preview or the share sheet: keep the work (no video reload).
  onShow() {
    enterPage(this);
    if (!this.loaded || this.data.loadError) void this.load(); // a load cut short by leaving retries
  },
  onUnload() {
    this.revision++;
  },
  onHide() { this.revision++; },
  async load() {
    const version = ++this.revision;
    try {
      const work = await request<Work>(
        "/shares/" + this.token,
        "GET",
        undefined,
        undefined,
        false,
      );
      if (version !== this.revision) return;
      work.result = media(work.result);
      if (work.kind === "image") work.results = resultImages(work);
      noteIssued(work.result, ...(work.results || []));
      this.loaded = true;
      this.setData({ work, loadError: "" });
    } catch (e) {
      // A withdrawn share (4xx) clears the work; a network blip keeps it.
      const gone = e instanceof RequestError && e.status >= 400 && e.status < 500;
      if (version === this.revision) this.setData({ loadError: (e as Error).message, ...(gone ? { work: null } : {}) });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  async preview(e?: WechatMiniprogram.CustomEvent<{ index?: number }>) {
    const index = e?.detail?.index || 0;
    const shown = this.data.work?.kind === "image" ? resultImages(this.data.work) : [];
    if (shown[index] && freshUrl(shown[index])) return wx.previewImage({ current: shown[index], urls: shown });
    const revision = this.revision + 1;
    await this.load();
    if (this.revision !== revision || this.data.loadError) return;
    if (this.data.work?.kind === "image") {
      const urls = resultImages(this.data.work);
      if (urls[index]) wx.previewImage({ current: urls[index], urls });
    }
  },
  home() {
    wx.switchTab({ url: "/pages/templates/index" });
  },
  onShareAppMessage() {
    return {
      title: this.data.work?.title || "豆播创作作品",
      path: "/pages/shared-work/index?token=" + this.token,
    };
  },
});
