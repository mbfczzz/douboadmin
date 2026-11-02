import {
  request,
  error,
  upload,
  cancelled,
  chooseReferenceFile,
} from "../../utils/api";
import type { Row, Asset } from "../../services/types";
import type { mixState } from "./state";

interface Editor {
  data: typeof mixState;
  assetRevision: number;
  revision: number;
  setData(data: Record<string, unknown>): void;
}

export async function addAssets(page: Editor) {
  if (page.data.uploading || page.data.restoring || page.data.busy) return;
  const revision = page.assetRevision;
  page.setData({ uploading: true });
  try {
    const remaining = 10 - page.data.assets.length;
    if (remaining <= 0) throw new Error("最多添加 10 个素材");
    const selected = await wx.chooseMedia({
      count: Math.min(9, remaining),
      mediaType: ["image", "video"],
      sourceType: ["album"],
    });
    for (const file of selected.tempFiles) {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("单个素材不能超过 50 MB");
      if (revision !== page.assetRevision) return;
      const row = await upload(file.tempFilePath);
      if (revision !== page.assetRevision) return;
      page.setData({
        assets: [
          ...page.data.assets,
          { ...row, isImage: row.data.type.startsWith("image/") },
        ],
      });
    }
  } catch (e) {
    if (revision === page.assetRevision && !cancelled(e)) error(e);
  } finally {
    if (revision === page.assetRevision) page.setData({ uploading: false });
  }
}

export async function uploadMusic(page: Editor) {
  if (page.data.uploading || page.data.busy) return;
  const revision = page.assetRevision;
  page.setData({ uploading: true });
  try {
    const file = await chooseReferenceFile("audio");
    if (revision !== page.assetRevision) return;
    const row = await upload(file.path);
    if (revision === page.assetRevision)
      page.setData({
        musicId: "asset:" + row.id,
        musicLabel: row.data.name,
        musicIndex: 0,
      });
  } catch (e) {
    if (revision === page.assetRevision && !cancelled(e)) error(e);
  } finally {
    if (revision === page.assetRevision) page.setData({ uploading: false });
  }
}

export async function restoreMusic(page: Editor, revision: number) {
  const id = page.data.musicId;
  if (!id) {
    page.setData({ musicIndex: 0, musicLabel: "不使用背景音乐" });
    return;
  }
  if (!id.startsWith("asset:")) {
    page.setData({ musicIndex: 0, musicLabel: "请重新上传音乐文件" });
    return;
  }
  try {
    const row = await request<Row<Asset>>("/assets/" + id.slice(6));
    if (page.revision === revision && page.data.musicId === id)
      page.setData({ musicIndex: 0, musicLabel: row.data.name });
  } catch {
    if (page.revision === revision && page.data.musicId === id)
      page.setData({ musicLabel: "音乐未能恢复，请重新选择" });
  }
}
