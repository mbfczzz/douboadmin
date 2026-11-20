import { chooseReferenceFiles, upload, cancelled, error } from "../../utils/api";
import { ask } from "../../services/dialog";
import { updateSession } from "../../services/agent";
import type { SessionDetail } from "../../services/agent";
import { editorAsset } from "../../utils/editor-assets";
import { MAX_MATERIALS } from "./constants";

// A project's materials: pictures and videos the plans refer to as @图片N /
// @视频N (numbered per type, in order). Kept on the project, not per message.
type Material = ReturnType<typeof editorAsset>;
type Page = {
  data: { session: SessionDetail | null; materials: (Material & { label: string })[]; prompt: string; uploading: boolean };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  priceLatest?(): Promise<void>;
};

export function materialLabels(materials: Material[]) {
  let images = 0, videos = 0;
  return materials.map((m) => ({ ...m, label: m.isImage ? "图片" + ++images : "视频" + ++videos }));
}

// Labels plus a label -> picture map the plan cards read (videos: cover).
export function materialData(list: Material[]) {
  const materials = materialLabels(list);
  const thumbs: Record<string, string> = {};
  for (const m of materials) thumbs[m.label] = m.isImage ? m.data.url : m.data.thumbnailUrl || "";
  return { materials, thumbs };
}

async function save(page: Page, ids: string[], materials: Material[]) {
  const s = page.data.session!;
  const row = await updateSession(s.id, s.version, { assets: ids });
  if (page.destroyed) return;
  page.setData({ session: { ...s, version: row.version, data: row.data }, ...materialData(materials) });
  void page.priceLatest?.(); // a material can change which model the plan uses
}

export const materialHandlers = {
  async addMaterial(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (!this.data.session || this.data.uploading) return;
    if (this.data.materials.length >= MAX_MATERIALS) return error(new Error(`每个项目最多 ${MAX_MATERIALS} 个素材`));
    this.setData({ uploading: true });
    try {
      // Pictures several at a time (a shop's photos), up to the project's room.
      const kind = e.currentTarget.dataset.kind === "video" ? "video" : "image";
      const files = await chooseReferenceFiles(kind, MAX_MATERIALS - this.data.materials.length);
      const added = [];
      for (const file of files) added.push(editorAsset(await upload(file.path)));
      const materials = [...this.data.materials, ...added];
      await save(this, materials.map((m) => m.id), materials);
    } catch (err) {
      if (!cancelled(err) && !this.destroyed) error(err);
    } finally {
      if (!this.destroyed) this.setData({ uploading: false });
    }
  },
  // Later ones of the same type move up a number, so plans that name them
  // would point elsewhere: say so before removing.
  async removeMaterial(this: Page, e: WechatMiniprogram.TouchEvent) {
    const gone = this.data.materials.find((m) => m.id === e.currentTarget.dataset.id);
    if (!gone) return;
    const ok = await ask({ title: `移除${gone.label}？`, content: "后面的同类素材会往前编号，已有方案里的 @ 引用可能对不上，需要让 Agent 按现有素材重写。", confirmText: "移除", tone: "danger", icon: "delete" });
    if (!ok || this.destroyed) return;
    const materials = this.data.materials.filter((m) => m.id !== gone.id);
    try {
      await save(this, materials.map((m) => m.id), materials);
    } catch (err) {
      error(err);
    }
  },
  // Long press shows the material full screen.
  previewMaterial(this: Page, e: WechatMiniprogram.TouchEvent) {
    const m = this.data.materials.find((x) => x.id === e.currentTarget.dataset.id);
    if (!m) return;
    if (m.isImage) {
      const urls = this.data.materials.filter((x) => x.isImage).map((x) => x.data.url);
      wx.previewImage({ urls, current: m.data.url });
    } else wx.previewMedia({ sources: [{ url: m.data.url, type: "video", poster: m.data.thumbnailUrl || "" }] });
  },
  // Tapping a material adds its mention to the message being written.
  mention(this: Page, e: WechatMiniprogram.TouchEvent) {
    const label = e.currentTarget.dataset.label as string;
    const prompt = this.data.prompt;
    this.setData({ prompt: (prompt && !/\s$/.test(prompt) ? prompt + " " : prompt) + "@" + label + " ", focus: true });
  },
};
