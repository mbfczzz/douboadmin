import type { View } from "./actions";

// Fill-in examples on the interface-first feature pages: a sample picture
// into an upload (视频唱歌). Text examples are handled in index.ts.
type Page = {
  data: { sections: View[]; art: Record<string, string> };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

export const exampleHandlers = {
  // A sample picture stands in for the user's own (marked 示例).
  sample(this: Page, e: WechatMiniprogram.TouchEvent) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    const s = this.data.sections[section];
    if (!s || s.type !== "upload" || !s.samples?.[index] || s.uploading) return;
    const pick = s.samples[index];
    const url = this.data.art[pick.art as string];
    if (!url) return;
    this.setData({ [`sections[${section}].file`]: { id: "", url, cover: "", isImage: true, name: pick.label + "（示例照片）", sample: true } });
  },
};
