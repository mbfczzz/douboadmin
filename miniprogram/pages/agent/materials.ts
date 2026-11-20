import { chooseReferenceFiles, upload, cancelled, error } from "../../utils/api";
import { createSession, updateSession } from "../../services/agent";
import type { SessionDetail } from "../../services/agent";
import { editorAsset } from "../../utils/editor-assets";
import { MAX_MATERIALS, MAX_ATTACHED } from "./constants";
import { remember } from "./remember";

// Pictures and videos are attached to the message being written and go
// with that message only. Each upload is also kept on the project, numbered
// per type (图片3, 视频1), so plans can still say @图片3 and generate with it.
type Material = ReturnType<typeof editorAsset>;
// fresh: uploaded for the message being written (not yet named by any plan).
export type Labelled = Material & { label: string; fresh?: boolean };
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

// Saves the project's materials; attached is the draft's attachments after
// the save (set only once it succeeded, with their labels).
async function save(page: Page, s: SessionDetail, materials: Material[], attached: Labelled[]) {
  const row = await updateSession(s.id, s.version, { assets: materials.map((m) => m.id) });
  if (page.destroyed || page.data.session?.id !== s.id) return; // switched project meanwhile
  const data = materialData(materials);
  const labelled = attached.map((a) => ({ ...data.materials.find((m) => m.id === a.id)!, fresh: a.fresh })).filter((m) => m.id);
  page.setData({ session: { ...page.data.session!, version: row.version, data: row.data }, ...data, attached: labelled });
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
        remember(row.id); // and is the one shown next visit
        this.setData({ session: { ...row, assets: [] } });
        void this.load?.(true);
      }
      const session = this.data.session!; // the project the files are for, even if the user switches
      const added: Material[] = [];
      for (const file of files) added.push(editorAsset(await upload(file.path)));
      if (this.destroyed || this.data.session?.id !== session.id) return;
      const attached = [...this.data.attached, ...added.map((m) => ({ ...m, label: "", fresh: true }))];
      await save(this, this.data.session!, [...this.data.materials, ...added], attached);
    } catch (err) {
      if (!cancelled(err) && !this.destroyed) error(err);
    } finally {
      if (!this.destroyed) this.setData({ uploading: false });
    }
  },
  // × on an attachment: it leaves the message. One uploaded for this draft
  // also leaves the project; one an edited question brought back stays
  // (plans may name it, and removing it would renumber the rest).
  async detach(this: Page, e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const gone = this.data.attached.find((m) => m.id === id);
    const attached = this.data.attached.filter((m) => m.id !== id);
    this.setData({ attached });
    if (!gone?.fresh || !this.data.session) return;
    try {
      await save(this, this.data.session, this.data.materials.filter((m) => m.id !== id), attached);
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

// A draft given up for 编辑 or 取消: files uploaded only for it leave the
// project again (they would shift the numbering and fill the limit).
export async function dropDraft(page: Page) {
  const fresh = page.data.attached.filter((m) => m.fresh);
  if (!fresh.length || !page.data.session) return;
  try {
    await save(page, page.data.session, page.data.materials.filter((m) => !fresh.some((f) => f.id === m.id)), page.data.attached.filter((m) => !m.fresh));
  } catch {
    // they stay in the project; nothing else is affected
  }
}
