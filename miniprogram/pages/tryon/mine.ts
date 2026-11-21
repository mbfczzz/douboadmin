import { request, upload, media, error, cancelled, chooseMediaFile, submitInput } from "../../utils/api";
import { loadConfig } from "../../utils/config-cache";
import { modelChoices, modelSettings } from "../create/models";
import { referenceSettings, creationMode } from "../create/references";
import type { Asset, Row } from "../../services/types";

// 我的服装 (服装 → 我的): the user's own outfits. 自己上传 keeps the picture as
// it is; AI 生成 redraws a photo of a whole outfit in the library's look
// (ghost mannequin, plain backdrop) with an image model, priced and confirmed
// like any task; it shows 生成中 until done (/api/my-outfits settles it).
export type MyOutfit = { id: string; title: string; assetId?: string; image?: string; source: string; status: "ready" | "drawing" | "failed"; error?: string };

// Backdrop colours offered on the AI sheet; a pick swaps the colour in the prompt.
export const BACKDROPS = ["浅粉色", "浅蓝色", "米白色", "浅灰色"];
const BACKDROP = /柔和的(\S{1,4}?)纯色影棚背景/;
export const OUTFIT_PROMPT =
  "参考@图片1 中的整套穿搭，生成一张服装电商产品图：整套服装完整地穿在隐形人台上，保持衣服自然的立体穿着形态，不出现人物、脸、皮肤、手和人台；" +
  "正面全身，鞋子摆在下方，居中并四周留白；柔和的浅粉色纯色影棚背景，均匀柔光，面料纹理清晰，真实摄影质感；" +
  "服装的款式、颜色、图案和材质与@图片1 完全一致；画面中没有文字和水印。";
// The AI sheet: the photo, a backdrop, the prompt (editable).
export type AiSheet = { asset: Row<Asset>; url: string; refs: { id: string; isImage: boolean; data: { url: string } }[]; prompt: string; backdrop: number };

type Page = {
  data: { mine: boolean; myOutfits: MyOutfit[]; myBusy: string; starting: boolean; tab: string; aiSheet: AiSheet | null };
  destroyed: boolean;
  mineTimer: number;
  setData(data: Record<string, unknown>): void;
};

export async function loadMine(page: Page) {
  clearTimeout(page.mineTimer);
  try {
    const r = await request<{ items: MyOutfit[] }>("/my-outfits");
    if (page.destroyed) return;
    const items = r.items.map((o) => ({ ...o, image: o.image ? media(o.image) : "" }));
    page.setData({ myOutfits: items, myLoading: false });
    // Pictures still drawing: look again shortly while the list is open.
    if (items.some((o) => o.status === "drawing") && page.data.mine) page.mineTimer = setTimeout(() => void loadMine(page), 5000) as unknown as number;
  } catch (e) {
    if (!page.destroyed) {
      page.setData({ myLoading: false });
      error(e);
    }
  }
}

async function pickPicture(page: Page, busy: string): Promise<Row<Asset> | null> {
  if (page.data.myBusy) return null;
  page.setData({ myBusy: busy });
  try {
    const file = await chooseMediaFile(true);
    return await upload(file.path);
  } catch (e) {
    if (!cancelled(e) && !page.destroyed) error(e);
    return null;
  } finally {
    if (!page.destroyed) page.setData({ myBusy: "" });
  }
}

// The first image model that takes a reference picture, set to 3:4.
async function outfitInput(asset: Row<Asset>, prompt: string) {
  const config = await loadConfig();
  const model = modelChoices(config.models, "image").find((m) => referenceSettings(m).allowImage);
  if (!model) throw new Error("暂无可参考图片的图片模型，请联系管理员");
  const rows = [asset];
  const s = modelSettings(model, { resolution: "", ratio: "3:4", duration: 0, assets: rows });
  return { kind: "image" as const, feature: "tryon", model: model.id, resolution: s.resolution, ratio: s.ratio, quality: s.quality, duration: 0, mode: creationMode(model, rows), prompt, assets: [asset.id] };
}

export const mineHandlers = {
  toggleMine(this: Page) {
    const mine = !this.data.mine;
    this.setData({ mine, ...(mine ? { myLoading: !this.data.myOutfits.length } : {}) });
    if (mine) void loadMine(this);
    else clearTimeout(this.mineTimer);
  },
  async uploadMine(this: Page) {
    const row = await pickPicture(this, "upload");
    if (!row || this.destroyed) return;
    try {
      await request("/my-outfits", "POST", { asset: row.id });
      wx.showToast({ title: "已加入我的服装", icon: "none" });
      await loadMine(this);
    } catch (e) {
      if (!this.destroyed) error(e);
    }
  },
  // A photo of the whole outfit opens the AI sheet (themed, not a system dialog).
  async aiMine(this: Page) {
    const row = await pickPicture(this, "ai");
    if (!row || this.destroyed) return;
    const url = media(row.data.url); // refs: the prompt box shows @图片1 as this photo
    this.setData({ aiSheet: { asset: row, url, refs: [{ id: row.id, isImage: true, data: { url } }], prompt: OUTFIT_PROMPT, backdrop: 0 } });
  },
  aiPrompt(this: Page, e: WechatMiniprogram.Input) {
    if (this.data.aiSheet) this.setData({ "aiSheet.prompt": e.detail.value });
  },
  aiBackdrop(this: Page, e: WechatMiniprogram.TouchEvent) {
    const sheet = this.data.aiSheet;
    const i = Number(e.currentTarget.dataset.index);
    if (!sheet || !BACKDROPS[i]) return;
    const prompt = BACKDROP.test(sheet.prompt) ? sheet.prompt.replace(BACKDROP, `柔和的${BACKDROPS[i]}纯色影棚背景`) : sheet.prompt;
    this.setData({ "aiSheet.backdrop": i, "aiSheet.prompt": prompt });
  },
  aiCancel(this: Page) {
    if (this.data.myBusy !== "ai") this.setData({ aiSheet: null });
  },
  // 生成: an ordinary image task (the points are confirmed first), registered as 生成中.
  async aiGenerate(this: Page) {
    const sheet = this.data.aiSheet;
    if (!sheet || this.data.myBusy) return;
    const prompt = sheet.prompt.trim() || OUTFIT_PROMPT;
    this.setData({ myBusy: "ai" });
    try {
      const job = await submitInput(await outfitInput(sheet.asset, prompt), "outfit-ai");
      await request("/my-outfits", "POST", { job: job.id });
      if (this.destroyed) return;
      this.setData({ aiSheet: null });
      wx.showToast({ title: "开始生成，完成后出现在这里", icon: "none" });
      await loadMine(this);
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) error(e);
    } finally {
      if (!this.destroyed) this.setData({ myBusy: "" });
    }
  },
  // A ready outfit goes to 试穿 (it is already the user's own picture).
  wearMine(this: Page, e: WechatMiniprogram.TouchEvent) {
    const o = this.data.myOutfits.find((x) => x.id === e.currentTarget.dataset.id);
    if (!o || o.status !== "ready" || !o.assetId || this.data.starting) return;
    this.setData({ garment: { asset: o.assetId, url: o.image || "", title: o.title, description: "" }, tab: "fit" });
  },
  async deleteMine(this: Page, e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const ok = await wx.showModal({ title: "删除这件服装？", content: "删除后不会出现在我的服装里。", confirmText: "删除", confirmColor: "#ff5c7c" });
    if (!ok.confirm || this.destroyed) return;
    try {
      await request("/my-outfits/" + id, "DELETE");
      await loadMine(this);
    } catch (err) {
      if (!this.destroyed) error(err);
    }
  },
};
