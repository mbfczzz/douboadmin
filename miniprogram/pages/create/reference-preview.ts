import { request, media, error } from "../../utils/api";
import type { Row, Asset } from "../../services/types";
import type { VisibleEditor } from "./editor-types";

const pending = new WeakMap<object, object>();

export function cancelPreview(page: VisibleEditor) {
  pending.delete(page);
  if (page.data.viewerOpen) closeViewer(page);
}

export function closeViewer(page: VisibleEditor) {
  page.setData({ viewerOpen: false });
  if (typeof wx.showTabBar === "function") wx.showTabBar({ animation: false, fail() {} });
}

// Opens the in-page viewer on the tapped image. Private OSS signatures
// expire, so the tapped image gets a fresh, ownership-checked URL first.
export async function openReferencePreview(page: VisibleEditor, id: string) {
  const images = () => page.data.assets.filter((a) => a.isImage);
  if (pending.has(page) || !images().some((a) => a.id === id)) return;
  const ticket = {};
  pending.set(page, ticket);
  const current = () =>
    pending.get(page) === ticket && page.visible && !page.destroyed && images().some((a) => a.id === id);
  try {
    const row = await request<Row<Asset>>("/assets/" + encodeURIComponent(id));
    if (!current()) return;
    if (!row.data.type.startsWith("image/")) throw new Error("当前素材不是图片");
    const list = images();
    page.setData({
      viewerOpen: true,
      viewerIndex: list.findIndex((a) => a.id === id),
      viewerItems: list.map((a, i) => ({
        id: a.id,
        url: a.id === id ? media(row.data.url) : a.data.url,
        label: `图片${i + 1}`,
      })),
    });
    if (typeof wx.hideTabBar === "function") wx.hideTabBar({ animation: false, fail() {} });
  } catch (reason) {
    if (current()) error(reason);
  } finally {
    if (pending.get(page) === ticket) pending.delete(page);
  }
}
