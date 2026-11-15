import { request, error, enterPage, media } from "../../utils/api";
import { resultImages } from "../../services/result-images";
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
  onLoad(o: Record<string, string>) {
    this.token = o.token || "";
  },
  onShow() {
    enterPage(this);
    void this.load();
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
      this.setData({ work, loadError: "" });
    } catch (e) {
      if (version === this.revision)
        this.setData({ work: null, loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  async preview(e?: WechatMiniprogram.CustomEvent<{ index?: number }>) {
    const index = e?.detail?.index || 0;
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
