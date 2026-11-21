import { chooseReferenceFile, upload, media, cancelled, error } from "../../utils/api";

// 一键复刻 from a video on the phone (not only a Douyin link): uploaded as
// the user's material, then remade like any other (services/hot-import.ts).
export const REFERENCE_SECONDS = 15;
type Page = {
  data: { loading: boolean; busy: boolean; uploadingVideo: boolean; uploadPercent: number };
  id: string;
  uploadId: string;
  revision: number;
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

export const uploadHandlers = {
  async uploadVideo(this: Page) {
    if (this.data.loading || this.data.busy || this.data.uploadingVideo) return;
    this.setData({ uploadingVideo: true, uploadPercent: -1 });
    try {
      const file = await chooseReferenceFile("video");
      // The button shows how far the upload is (a long video takes a while).
      let shown = -1;
      const row = await upload(file.path, false, undefined, (p) => {
        if (!this.destroyed && p !== shown) this.setData({ uploadPercent: (shown = p) });
      });
      if (this.destroyed) return;
      this.revision++; // a link being read meanwhile no longer applies
      this.id = "";
      this.uploadId = row.id;
      const seconds = Math.round(file.duration || 0);
      const video = { id: "", uploaded: true, title: "我上传的视频", url: media(row.data.url), cover: row.data.thumbnailUrl ? media(row.data.thumbnailUrl) : "", author: "", dateText: "" };
      this.setData({ video, seconds, tooLong: seconds > REFERENCE_SECONDS, loadError: "" });
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) error(e);
    } finally {
      if (!this.destroyed) this.setData({ uploadingVideo: false });
    }
  },
};
