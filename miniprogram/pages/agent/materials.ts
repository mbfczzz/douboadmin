import { chooseReferenceFiles, upload, cancelled, error } from "../../utils/api";
import { createSession, updateSession } from "../../services/agent";
import type { SessionDetail } from "../../services/agent";
import { editorAsset } from "../../utils/editor-assets";
import { MAX_MATERIALS, MAX_ATTACHED } from "./constants";

// Pictures and videos are attached to the message being written and go
// with that message only. Each upload is also kept on the project, numbered
// per type (图片3, 视频1), so plans can still say @图片3 and generate with it.
type Material = ReturnType<typeof editorAsset>;
export type Labelled = Material & { label: string };
type Page = {
  data: { session: SessionDetail | null; materials: Labelled[]; attached: Labelled[]; uploading: boolean; skills: unknown[] };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  priceLatest?(): Promise<void>;
  load?(force?: boolean): Promise<void>;
};

export function materialLabels(materials: Material[]): Labelled[] {
  let images = 0, videos = 0;
  return materials.map((m) => ({ ...m, label: m.isImage ? "图片" + ++images : "视频" + ++videos }));
}

// Labels, a label -> picture map the plan cards read (videos: cover), and an
// id -> file map the sent messages show their attachments from.
export function materialData(list: Material[]) {
  const materials = materialLabels(list);
  const thumbs: Record<string, string> = {};
  const files: Record<string, { label: string; thumb: string; video: boolean }> = {};
  for (const m of materials) {
    const thumb = m.isImage ? m.data.url : m.data.thumbnailUrl || "";
    thumbs[m.label] = thumb;
    files[m.id] = { label: m.label, thumb, video: !m.isImage };
  }
  return { materials, thumbs, files };
}

async function save(page: Page, materials: Material[]) {
  const s = page.data.session!;
  const row = await updateSession(s.id, s.version, { assets: materials.map((m) => m.id) });
  if (page.destroyed) return;
  const data = materialData(materials);
  // The attached ones keep their (new) labels.
  const attached = data.materials.filter((m) => page.data.attached.some((a) => a.id === m.id));
  page.setData({ session: { ...page.data.session!, version: row.version, data: row.data }, ...data, attached });
  void page.priceLatest?.(); // a material can change which model the plan uses
}

export const materialHandlers = {
  async addMaterial(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading) return;
    const room = Math.min(MAX_ATTACHED - this.data.attached.length, MAX_MATERIALS - this.data.materials.length);
    if (room <= 0) return error(new Error(this.data.attached.length >= MAX_ATTACHED ? `每条消息最多 ${MAX_ATTACHED} 个素材` : `每个项目最多 ${MAX_MATERIALS} 个素材`));
    this.setData({ uploading: true });
    try {
      const kind = e.currentTarget.dataset.kind === "video" ? "video" : "image";
      const files = await chooseReferenceFiles(kind, room); // pictures several at a time
      if (!this.data.session) {
        const row = await createSession("general"); // a first upload starts a free project
        this.setData({ session: { ...row, assets: [] } });
        void this.load?.(true);
      }
      const added = [];
      for (const file of files) added.push(editorAsset(await upload(file.path)));
      this.setData({ attached: [...this.data.attached, ...added.map((m) => ({ ...m, label: "" }))] });
      await save(this, [...this.data.materials, ...added]);
    } catch (err) {
      if (!cancelled(err) && !this.destroyed) error(err);
    } finally {
      if (!this.destroyed) this.setData({ uploading: false });
    }
  },
  // × on an attachment: it leaves the message, and the project (it was only
  // just added, so no plan names it yet).
  async detach(this: Page, e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    this.setData({ attached: this.data.attached.filter((m) => m.id !== id) });
    try {
      await save(this, this.data.materials.filter((m) => m.id !== id));
    } catch (err) {
      error(err);
    }
  },
  // Tap shows a material full screen (an attachment, or one in a sent message).
  previewMaterial(this: Page, e: WechatMiniprogram.TouchEvent) {
    const m = this.data.materials.find((x) => x.id === e.currentTarget.dataset.id);
    if (!m) return;
    if (m.isImage) wx.previewImage({ urls: [m.data.url], current: m.data.url });
    else wx.previewMedia({ sources: [{ url: m.data.url, type: "video", poster: m.data.thumbnailUrl || "" }] });
  },
};
