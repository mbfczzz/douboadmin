import { request, error } from "../../utils/api";
import { ask } from "../../services/dialog";
import type { Row, Template } from "../../services/types";

type Page = {
  destroyed: boolean;
  data: { templates: Row<Template>[] };
  setData(value: Record<string, unknown>): void;
};

// Long-press a favorite: confirm, then switch it off with the current
// version (as the template page does) and drop the card in place.
export async function unfavorite(page: Page, id: string) {
  const item = page.data.templates.find((t) => t.id === id);
  if (!item) return;
  wx.vibrateShort?.({ type: "light" });
  const confirmed = await ask({ title: "取消收藏？", content: item.data.title, confirmText: "取消收藏", cancelText: "保留", tone: "danger", icon: "heart" });
  if (!confirmed || page.destroyed) return;
  try {
    const current = await request<Row<{ active: boolean }>>("/favorites/" + id);
    if (current?.data.active)
      await request("/favorites/" + id, "PUT", { active: false, version: current.version || 0 });
    if (!page.destroyed) page.setData({ templates: page.data.templates.filter((t) => t.id !== id) });
    wx.showToast({ title: "已取消收藏", icon: "none" });
  } catch (e) {
    error(e);
  }
}
