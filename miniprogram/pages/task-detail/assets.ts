import type { Row, Asset } from "../../services/types";
import { media } from "../../utils/api";

// Named like the creation page (图片N, matching @图片N; 视频N / 音频N),
// never by upload file name (tmp_…).
export function assetViews(rows: Row<Asset>[]) {
  const counts: Record<string, number> = {};
  return rows.map((a) => {
    const type = a.data.type || "";
    const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "file";
    counts[kind] = (counts[kind] || 0) + 1;
    const name = { image: "图片", video: "视频", audio: "音频", file: "文件" }[kind];
    const cover = a.data.thumbnailUrl ? media(a.data.thumbnailUrl) : "";
    return { ...a, data: { ...a.data, url: media(a.data.url), thumbnailUrl: cover }, isImage: kind === "image", isVideo: kind === "video", kind, label: name + counts[kind] };
  });
}
