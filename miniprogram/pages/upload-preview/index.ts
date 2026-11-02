import { upload, error, enterPage } from "../../utils/api";
import type { Row, Asset } from "../../services/types";
Page({
  data: { path: "", name: "", busy: false, uploaded: false },
  savedAsset: undefined as Row<Asset> | undefined,
  notified: false,
  destroyed: false,
  onUnload() {
    this.destroyed = true;
  },
  onShow() {
    enterPage(this);
  },
  onLoad() {
    this.getOpenerEventChannel().on(
      "file",
      (f: { path: string; name: string }) => this.setData(f),
    );
  },
  async confirm() {
    if (!this.data.path || this.data.busy) return;
    this.setData({ busy: true });
    try {
      const asset = this.savedAsset || (await upload(this.data.path));
      if (this.destroyed) return;
      this.savedAsset = asset;
      this.setData({ uploaded: true });
      if (!this.notified) {
        this.getOpenerEventChannel().emit("confirmed", asset);
        this.notified = true;
      }
      await new Promise<void>((resolve, reject) =>
        wx.navigateBack({
          success: () => resolve(),
          fail: () => reject(new Error("照片已上传，请点击返回继续")),
        }),
      );
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  back() {
    wx.navigateBack();
  },
});
