import { editorAsset } from "../../utils/editor-assets";
import { cancelled, chooseReferenceFile, error, upload } from "../../utils/api";
import type { Row, Asset } from "../../services/types";
import type { ReferenceEditor } from "./editor-types";
import { referenceError, selectedModel } from "./references";

type Editor = ReferenceEditor & { removeAsset(id: string): void };

// 替换 swaps a reference in place: it keeps its position and number, so
// @图片1 in the description now points at the new file.
export async function replaceReference(page: Editor, id: string) {
  const d = page.data;
  if (d.uploading || d.restoring || d.busy || d.modelsLoading || d.modelError) return;
  const old = d.assets.find((a: Row<Asset>) => a.id === id);
  if (!old) return;
  const kind = old.data.type.split("/")[0] as "image" | "video" | "audio";
  const revision = page.assetRevision;
  page.setData({ uploading: true });
  try {
    const file = await chooseReferenceFile(kind);
    if (revision !== page.assetRevision) return;
    // Like 添加: check the model's size limit before spending an upload.
    const before = selectedModel(page);
    const candidate = { ...old, id: "new", data: { ...old.data, size: file.size } };
    const early = before && referenceError(before, page.data.assets.map((a: Row<Asset>) => (a.id === id ? candidate : a)));
    if (early) throw new Error(early);
    const row = editorAsset(await upload(file.path));
    if (revision !== page.assetRevision) return;
    const model = selectedModel(page);
    if (!model) throw new Error("模型配置已更新，请重新选择模型");
    const assets = page.data.assets.map((a: Row<Asset>) => (a.id === id ? row : a));
    if (assets.every((a: Row<Asset>) => a.id !== row.id)) return; // removed meanwhile
    const problem = referenceError(model, assets);
    if (problem) throw new Error(problem);
    page.setData({ assets });
    page.refreshParameters?.();
    wx.showToast({ title: "已替换，描述里的引用不变", icon: "none" });
  } catch (e) {
    if (revision === page.assetRevision && !cancelled(e)) error(e);
  } finally {
    if (revision === page.assetRevision) page.setData({ uploading: false });
  }
}

// × on a reference the description names: removing it also drops @图片N, so
// offer to swap the file instead.
export async function removeOrReplace(page: Editor, id: string) {
  const asset = page.data.assets.find((a: Row<Asset>) => a.id === id);
  const image = !!asset?.data.type.startsWith("image/");
  const same = page.data.assets.filter((a: Row<Asset>) => a.data.type.startsWith(image ? "image/" : "video/"));
  const label = (image ? "图片" : "视频") + (same.findIndex((a: Row<Asset>) => a.id === id) + 1);
  if (!asset || !new RegExp(`[@＠]${label}(?!\\d)`).test(page.data.prompt)) return page.removeAsset(id);
  const res = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult | null>((resolve) =>
    wx.showModal({
      title: `描述里引用了${label}`,
      content: `删除后描述中的 @${label} 会一起去掉。换一张可以保留引用。`,
      confirmText: "换一张",
      cancelText: "删除",
      success: resolve,
      fail: () => resolve(null),
    }),
  );
  if (!res) return;
  if (res.confirm) await replaceReference(page, id);
  else if (res.cancel) page.removeAsset(id);
}
