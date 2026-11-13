import { renderPoster } from "./poster";
import type { InvitePoster } from "../../utils/invite-poster";
export async function saveQR(
  qr: string,
  code: string,
  page?: any,
  details?: InvitePoster,
) {
  let filePath = "";
  if (qr.startsWith("https://")) {
    const download =
      await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
        (resolve, reject) =>
          wx.downloadFile({ url: qr, success: resolve, fail: reject }),
      );
    if (download.statusCode !== 200)
      throw new Error("二维码下载失败，请刷新页面后重试");
    filePath = download.tempFilePath;
  } else if (qr.startsWith("data:image/png;base64,")) {
    filePath = `${wx.env.USER_DATA_PATH}/share-${code.replace(/[^A-Z0-9]/g, "")}.png`;
    wx.getFileSystemManager().writeFileSync(
      filePath,
      qr.slice("data:image/png;base64,".length),
      "base64",
    );
  } else throw new Error("二维码链接不可用，请刷新页面后重试");
  let poster = "";
  try {
    if (page && details) poster = await renderPoster(page, filePath, details);
    await wx.saveImageToPhotosAlbum({ filePath: poster || filePath });
  } finally {
    if (poster)
      wx.getFileSystemManager().unlink({ filePath: poster, fail: () => {} });
    wx.getFileSystemManager().unlink({ filePath, fail: () => {} });
  }
}
