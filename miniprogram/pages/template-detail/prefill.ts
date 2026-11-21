import { recipeAsset } from "./recipe";
import type { Asset, Row, Template } from "../../services/types";

// Pictures handed over from a 创作 preset's 模板案例 (create/feature-cases):
// they fill this template's photo slots in order, once, after it loads. The
// user can still replace or remove each one before generating.
type Page = Parameters<typeof recipeAsset>[0] & {
  data: { template: Row<Template> | null; assets: Row<Asset>[] };
  setData(data: Record<string, unknown>): void;
};
const KEY = "template-prefill";

export function takePrefill(templateId: string): Row<Asset>[] {
  const p = wx.getStorageSync(KEY) as { templateId?: string; assets?: Row<Asset>[] } | "";
  if (!p || p.templateId !== templateId || !Array.isArray(p.assets)) return [];
  wx.removeStorageSync(KEY);
  return p.assets;
}

export function applyPrefill(page: Page, assets: Row<Asset>[]) {
  const t = page.data.template;
  if (!t || !assets.length) return;
  const slots = t.data.imageSlots || [];
  if (slots.length) {
    assets.slice(0, slots.length).forEach((a, i) => recipeAsset(page, i + 1, a));
  } else if (t.data.requiredImages > 0) {
    page.setData({ assets: assets.slice(0, t.data.requiredImages) });
  } else return; // takes no photos

  wx.showToast({ title: "已放入你的图片，可点图片替换", icon: "none" });
}
