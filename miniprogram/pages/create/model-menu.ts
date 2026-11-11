import type { MenuPage } from "../../services/page-contracts";

// Preserve the designed downward menu when space permits; flip only to fit.
export function openModelMenu(page: MenuPage) {
  const desired = Math.min(320, page.data.availableModels.length * 76 + 12);
  page.setData({
    showModels: true,
    modelMenuHeight: desired,
    modelMenuUp: page.data.expanded,
  });
  if (typeof wx.createSelectorQuery !== "function") return;
  const info = wx.getWindowInfo();
  const bar = Math.max(44, info.windowWidth * 96 / 750) + info.windowWidth * 20 / 750;
  wx.createSelectorQuery()
    .select(".workspace")
    .boundingClientRect((value) => {
      if (!page.visible || !page.data.showModels || !value) return;
      const rect = value as WechatMiniprogram.BoundingClientRectCallbackResult;
      const top = (info.statusBarHeight || 24) + 44 + 8;
      const safeBottom = info.safeArea
        ? info.screenHeight - info.safeArea.bottom
        : 0;
      const below = Math.max(
        0,
        info.windowHeight - safeBottom - bar - 12 - (rect.bottom - 8),
      );
      const above = Math.max(0, rect.bottom - 64 - top);
      const up = page.data.expanded || (below < desired && above > below);
      page.setData({
        modelMenuUp: up,
        modelMenuHeight: Math.max(44, Math.min(desired, up ? above : below)),
      });
    })
    .exec();
}
