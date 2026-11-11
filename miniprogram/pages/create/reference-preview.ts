import { request, media, error } from "../../utils/api";
import type { Row, Asset } from "../../services/types";
import type { VisibleEditor } from "./editor-types";

const pending = new WeakMap<object, object>();

export function cancelPreview(page: object) {
  pending.delete(page);
}

export async function openReferencePreview(page: VisibleEditor, id: string) {
  if (
    pending.has(page) ||
    !page.data.assets.some((asset) => asset.id === id && asset.isImage)
  )
    return;
  const ticket = {};
  pending.set(page, ticket);
  const finish = () => {
    if (pending.get(page) === ticket) pending.delete(page);
  };
  const current = () =>
    pending.get(page) === ticket &&
    page.visible &&
    !page.destroyed &&
    page.data.assets.some((asset) => asset.id === id && asset.isImage);
  let submitted = false;
  try {
    // Private OSS signatures expire; get a fresh, ownership-checked URL.
    const row = await request<Row<Asset>>("/assets/" + encodeURIComponent(id));
    if (!current()) return;
    if (!row.data.type.startsWith("image/"))
      throw new Error("当前素材不是图片");
    submitted = true;
    wx.previewImage({
      urls: [media(row.data.url)],
      fail: () => {
        if (current()) error(new Error("图片预览失败，请重试"));
      },
      complete: finish,
    });
  } catch (reason) {
    submitted = false;
    if (current()) error(reason);
  } finally {
    if (!submitted) finish();
  }
}
