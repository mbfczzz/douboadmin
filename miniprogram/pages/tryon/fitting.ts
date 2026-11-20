import { request, upload, media, error, cancelled, chooseMediaFile, openPage } from "../../utils/api";
import type { Asset, Row } from "../../services/types";
import type { Outfit } from "./gallery";

// The 试穿 tab: the person's photo, then an outfit (from the library or an
// uploaded picture). 开始试穿 hands both to the image editor as @图片1 (the
// person) and @图片2 (the outfit) with a written prompt; models, price and
// generation stay the editor's own (its AI试衣 preset, pages/create/feature.ts).
export type Person = { id: string; url: string };
// outfit: a library outfit's id; asset: an uploaded picture's asset id.
export type Garment = { outfit?: string; asset?: string; url: string; title: string; description: string };

type Page = {
  data: { person: Person | null; garment: Garment | null; personBusy: boolean; garmentBusy: boolean; keepBackground: boolean; starting: boolean; tab: string };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

async function pickImage(page: Page, flag: "personBusy" | "garmentBusy") {
  if (page.data.personBusy || page.data.garmentBusy || page.data.starting) return null;
  page.setData({ [flag]: true });
  try {
    const file = await chooseMediaFile(true);
    const row = await upload(file.path);
    return page.destroyed ? null : row;
  } catch (e) {
    if (!cancelled(e) && !page.destroyed) error(e);
    return null;
  } finally {
    if (!page.destroyed) page.setData({ [flag]: false });
  }
}

export function tryPrompt(garment: Garment, keepBackground: boolean) {
  const named = garment.title ? `（${garment.title}${garment.description ? "：" + garment.description : ""}）` : "";
  const scene = keepBackground ? "保留原照片的背景与光线" : "换成干净明亮的影棚背景";
  return `让@图片1中的人物换穿@图片2中的服装${named}。保持人物的脸、发型、肤色、体型和姿势不变，${scene}；服装的款式、颜色、图案和材质与@图片2一致，自然贴合身形，真实摄影质感。`;
}

export function wearOutfit(page: Page, o: Outfit) {
  page.setData({ garment: { outfit: o.id, url: o.image, title: o.title, description: o.description }, tab: "fit", preview: null });
}

export const fittingHandlers = {
  async choosePerson(this: Page) {
    const row = await pickImage(this, "personBusy");
    if (row) this.setData({ person: { id: row.id, url: media(row.data.url) } });
  },
  removePerson(this: Page) {
    if (!this.data.starting) this.setData({ person: null });
  },
  async uploadGarment(this: Page) {
    const row = await pickImage(this, "garmentBusy");
    if (row) this.setData({ garment: { asset: row.id, url: media(row.data.url), title: "", description: "" } });
  },
  removeGarment(this: Page) {
    if (!this.data.starting) this.setData({ garment: null });
  },
  toggleBackground(this: Page) {
    if (!this.data.starting) this.setData({ keepBackground: !this.data.keepBackground });
  },
  async startFitting(this: Page) {
    const { person, garment, keepBackground } = this.data;
    if (this.data.starting) return;
    if (!person || !garment) {
      wx.showToast({ title: person ? "请先选一件服装" : "请先上传人物照片", icon: "none" });
      return;
    }
    this.setData({ starting: true });
    try {
      // A library outfit becomes the user's own asset (the same one each time).
      const asset = garment.asset || (await request<Row<Asset>>(`/outfits/${garment.outfit}/use`, "POST")).id;
      if (this.destroyed) return;
      wx.setStorageSync("edit-draft", { kind: "image", prompt: tryPrompt(garment, keepBackground), ratio: "3:4", resolution: "", duration: 0, assets: [person.id, asset] });
      openPage(this, { url: "/pages/create/index?feature=tryon" });
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ starting: false });
    }
  },
};
