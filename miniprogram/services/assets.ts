// Upload limits (the server checks the same): videos up to 500 MB, since
// 一键复刻 takes whole phone recordings; pictures, audio and files 50 MB.
const MB = 1024 * 1024;
export function checkUploadSize(size: number, video: boolean) {
  if (video && size > 500 * MB) throw new Error("视频不能超过 500 MB");
  if (!video && size > 50 * MB) throw new Error("文件不能超过 50 MB");
}

export async function chooseMediaFile(
  imageOnly = false,
  sourceIndex?: number,
): Promise<{ path: string; name: string }> {
  const action =
    sourceIndex === undefined
      ? await wx.showActionSheet({
          itemList: imageOnly
            ? ["从相册选择", "拍摄照片", "选择文件"]
            : ["图片 / 视频", "选择音频或文件"],
        })
      : { tapIndex: sourceIndex };
  if (
    (imageOnly && action.tapIndex === 2) ||
    (!imageOnly && action.tapIndex === 1)
  ) {
    const res = await wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: imageOnly
        ? ["jpg", "jpeg", "png", "webp"]
        : ["jpg", "jpeg", "png", "webp", "mp4", "mp3", "wav"],
    });
    const f = res.tempFiles[0];
    if (imageOnly && !/\.(jpe?g|png|webp)$/i.test(f.name))
      throw new Error("请选择 JPG、PNG 或 WebP 图片");
    checkUploadSize(f.size, /\.mp4$/i.test(f.name));
    return { path: f.path, name: f.name };
  }
  const res = await wx.chooseMedia({
    count: 1,
    mediaType: imageOnly ? ["image"] : ["image", "video"],
    sourceType: imageOnly && action.tapIndex === 1 ? ["camera"] : ["album"],
  });
  const f = res.tempFiles[0];
  checkUploadSize(f.size, f.fileType === "video");
  return {
    path: f.tempFilePath,
    name: f.fileType === "video" ? "视频素材.mp4" : "参考照片.jpg",
  };
}
export function cancelled(e: unknown) {
  return String((e as { errMsg?: string })?.errMsg || "").includes("cancel");
}

export async function chooseReferenceFile(kind: "image" | "video" | "audio") {
  if (kind === "audio") {
    const res = await wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["mp3", "wav"],
    });
    const file = res.tempFiles[0];
    checkUploadSize(file.size, false);
    return { path: file.path, name: file.name, size: file.size };
  }
  const res = await wx.chooseMedia({
    count: 1,
    mediaType: [kind],
    sourceType: ["album"],
  });
  const file = res.tempFiles[0];
  checkUploadSize(file.size, kind === "video");
  return {
    path: file.tempFilePath,
    name: kind === "video" ? "参考视频.mp4" : "参考图片.jpg",
    size: file.size,
    duration: (file as { duration?: number }).duration || 0, // seconds, for videos
  };
}

// Several pictures (or one video) from the album at once, e.g. a shop's
// photos for an Agent project. An oversized file refuses the whole pick.
export async function chooseReferenceFiles(kind: "image" | "video", count: number) {
  const res = await wx.chooseMedia({ count: kind === "video" ? 1 : Math.max(1, count), mediaType: [kind], sourceType: ["album"] });
  res.tempFiles.forEach((f) => checkUploadSize(f.size, kind === "video"));
  return res.tempFiles.map((f) => ({ path: f.tempFilePath, name: kind === "video" ? "参考视频.mp4" : "参考图片.jpg", size: f.size }));
}
