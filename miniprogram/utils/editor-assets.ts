import type { Asset, Row } from "../services/types";
import { media } from "../services/media";

interface AssetEditor {
  assetRevision: number;
  restoreIds: string[];
  setData(data: Record<string, unknown>): void;
}

export async function restoreEditorAssets(
  page: AssetEditor,
  ids: string[],
  read: (id: string) => Promise<Row<Asset>>,
) {
  const revision = ++page.assetRevision;
  page.restoreIds = [...ids];
  page.setData({ assets: [], restoring: ids.length > 0, restoreError: "" });
  try {
    const rows = await Promise.all(ids.map(read));
    if (page.assetRevision !== revision) return;
    page.setData({
      assets: rows.map((row) => ({
        ...row,
        data: { ...row.data, url: media(row.data.url) },
        isImage: row.data.type.startsWith("image/"),
      })),
    });
  } catch {
    if (page.assetRevision === revision)
      page.setData({
        restoreError: "参考素材未能恢复，请重试或清空后重新添加。",
      });
  } finally {
    if (page.assetRevision === revision) page.setData({ restoring: false });
  }
}

export function clearEditorAssets(page: AssetEditor) {
  page.assetRevision++;
  page.restoreIds = [];
  page.setData({
    assets: [],
    restoring: false,
    uploading: false,
    restoreError: "",
  });
}
