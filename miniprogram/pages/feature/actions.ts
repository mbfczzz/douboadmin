import { chooseReferenceFile, upload, cancelled, error } from "../../utils/api";
import { editorAsset } from "../../utils/editor-assets";
import type { Section } from "./configs";

// The working parts of an interface-first feature page: real uploads into
// the user's materials, option sheets, and the checks the final action runs
// before saying the feature is coming.
export type Upload = { id: string; url: string; cover: string; isImage: boolean; name: string };
export type View = Section & {
  value?: string;
  picks?: { label: string; on: boolean; art?: string }[];
  target?: number;
  file?: Upload | null;
  uploading?: boolean;
};
type Page = {
  data: { tab: number; sections: View[] };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};
const at = (e: WechatMiniprogram.TouchEvent) => Number(e.currentTarget.dataset.section);

export const featureActions = {
  async upload(this: Page, e: WechatMiniprogram.TouchEvent) {
    const i = at(e), s = this.data.sections[i];
    if (!s || s.type !== "upload" || s.uploading) return;
    this.setData({ [`sections[${i}].uploading`]: true });
    try {
      const file = await chooseReferenceFile(s.media);
      const row = editorAsset(await upload(file.path));
      const done: Upload = { id: row.id, url: row.data.url, cover: row.data.thumbnailUrl || "", isImage: row.isImage, name: row.data.name || file.name };
      if (!this.destroyed) this.setData({ [`sections[${i}].file`]: done });
    } catch (err) {
      if (!cancelled(err) && !this.destroyed) error(err);
    } finally {
      if (!this.destroyed) this.setData({ [`sections[${i}].uploading`]: false });
    }
  },
  removeUpload(this: Page, e: WechatMiniprogram.TouchEvent) {
    this.setData({ [`sections[${at(e)}].file`]: null });
  },
  row(this: Page, e: WechatMiniprogram.TouchEvent) {
    const i = at(e), j = Number(e.currentTarget.dataset.index), s = this.data.sections[i];
    if (!s || s.type !== "rows") return;
    const options = s.items[j].options;
    wx.showActionSheet({
      itemList: options,
      success: (r) => !this.destroyed && this.setData({ [`sections[${i}].items[${j}].value`]: options[r.tapIndex] }),
    });
  },
  // The first missing input of what is on screen, or "" when all is there.
  missing(this: Page) {
    for (const s of this.data.sections) {
      if (s.tab !== undefined && s.tab !== this.data.tab) continue;
      if (s.type === "upload" && s.required && !s.file) return s.uploading ? "文件还在上传，请稍候" : s.required;
      if (s.type === "text" && s.required && !(s.value || "").trim()) return s.required;
    }
    return "";
  },
  start(this: Page & { missing(): string }) {
    const problem = this.missing();
    wx.showToast({ title: problem || "该功能即将开放", icon: "none" });
  },
};
