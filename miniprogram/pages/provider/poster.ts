import type { InvitePoster } from "../../utils/invite-poster";
import {
  drawInvitePoster,
  POSTER_WIDTH,
  POSTER_HEIGHT,
} from "../../utils/invite-poster";

export async function renderPoster(
  page: any,
  source: string,
  data: InvitePoster,
): Promise<string> {
  const canvas = await new Promise<WechatMiniprogram.Canvas>(
    (resolve, reject) => {
      wx.createSelectorQuery()
        .in(page)
        .select("#invite-poster")
        .fields({ node: true })
        .exec((result) => {
          if (result[0]?.node) resolve(result[0].node);
          else reject(new Error("分享卡片初始化失败，请重试"));
        });
    },
  );
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const image = canvas.createImage();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("小程序码图片加载失败"));
    image.src = source;
  });
  drawInvitePoster(canvas.getContext("2d"), image, data);
  return new Promise((resolve, reject) =>
    wx.canvasToTempFilePath({
      canvas,
      fileType: "png",
      success: (r) => resolve(r.tempFilePath),
      fail: reject,
    }),
  );
}
