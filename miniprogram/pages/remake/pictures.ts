import { chooseReferenceFile, upload, media, cancelled, error } from "../../utils/api";

// 一键复刻 can swap in the user's own product or person: up to three pictures,
// handed to the editor after the video as @图片1…@图片3.
export const MAX_PICTURES = 3;
export type Picture = { id: string; url: string };
type Page = {
  data: { pictures: Picture[]; picturing: boolean; busy: boolean };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

export const pictureHandlers = {
  async addPicture(this: Page) {
    if (this.data.picturing || this.data.busy || this.data.pictures.length >= MAX_PICTURES) return;
    this.setData({ picturing: true });
    try {
      const file = await chooseReferenceFile("image");
      const row = await upload(file.path);
      if (!this.destroyed) this.setData({ pictures: [...this.data.pictures, { id: row.id, url: media(row.data.url) }] });
    } catch (e) {
      if (!cancelled(e) && !this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ picturing: false });
    }
  },
  removePicture(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    this.setData({ pictures: this.data.pictures.filter((p) => p.id !== e.currentTarget.dataset.id) });
  },
};
