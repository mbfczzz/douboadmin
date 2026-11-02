import { request, error, enterPage, media } from "../../utils/api";
interface Work {
  title: string;
  kind: string;
  result: string;
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
      this.setData({ work, loadError: "" });
    } catch (e) {
      if (version === this.revision)
        this.setData({ work: null, loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  preview() {
    if (this.data.work?.kind === "image")
      wx.previewImage({ urls: [this.data.work.result] });
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
