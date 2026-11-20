import { chooseReferenceFile, upload, cancelled, error } from "../../utils/api";
import { updateSession } from "../../services/agent";
import type { SessionDetail } from "../../services/agent";
import { editorAsset } from "../../utils/editor-assets";
import { MAX_MATERIALS } from "./constants";

// A project's materials: pictures and videos the plans refer to as @图片N /
// @视频N (numbered per type, in order). Kept on the project, not per message.
type Material = ReturnType<typeof editorAsset>;
type Page = {
  data: { session: SessionDetail | null; materials: Material[]; prompt: string; uploading: boolean };
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
      const file = await chooseReferenceFile(e.currentTarget.dataset.kind === "video" ? "video" : "image");
      const row = editorAsset(await upload(file.path));
      const materials = [...this.data.materials, row];
      await save(this, materials.map((m) => m.id), materials);
    } catch (err) {
      if (!cancelled(err) && !this.destroyed) error(err);
    } finally {
      if (!this.destroyed) this.setData({ uploading: false });
    }
  },
  async removeMaterial(this: Page, e: WechatMiniprogram.TouchEvent) {
    const materials = this.data.materials.filter((m) => m.id !== e.currentTarget.dataset.id);
    try {
      await save(this, materials.map((m) => m.id), materials);
    } catch (err) {
      error(err);
    }
  },
  // Tapping a material adds its mention to the message being written.
  mention(this: Page, e: WechatMiniprogram.TouchEvent) {
    const label = e.currentTarget.dataset.label as string;
    const prompt = this.data.prompt;
    this.setData({ prompt: (prompt && !/\s$/.test(prompt) ? prompt + " " : prompt) + "@" + label + " ", focus: true });
  },
};
