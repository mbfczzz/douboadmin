export async function saveQR(qr: string, code: string) {
  let filePath = "";
  if (qr.startsWith("https://")) {
    const download = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
      (resolve, reject) => wx.downloadFile({ url: qr, success: resolve, fail: reject }),
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
  try {
    await wx.saveImageToPhotosAlbum({ filePath });
  } finally {
    wx.getFileSystemManager().unlink({ filePath, fail: () => {} });
  }
}
