import type { MenuPage } from "../../services/page-contracts";

// Where the menu fits (up or down, and how tall), remembered per page so it
// opens straight into place instead of opening and then jumping.
// Space is remembered, not height: the model count may change after measuring.
const geometry = new WeakMap<object, { above: number; below: number }>();
function fit(page: MenuPage, space: { above: number; below: number }) {
  const desired = desiredHeight(page);
  const up = page.data.expanded || (space.below < desired && space.above > space.below);
  return { up, height: Math.max(44, Math.min(desired, up ? space.above : space.below)) };
}

function desiredHeight(page: MenuPage) {
  // Rows render at about 56px (name + one-line note); the menu hugs them.
  return Math.min(320, page.data.availableModels.length * 56 + 14);
}

// Measure where the menu fits. `open` applies it to the showing menu;
// otherwise it only primes the remembered geometry (called on page ready).
export function measureModelMenu(page: MenuPage, open = false) {
  if (typeof wx.createSelectorQuery !== "function") return;
  const info = wx.getWindowInfo();
  const bar = 70; // custom-tab-bar content height; safe area is added below.
  wx.createSelectorQuery()
    .select(".workspace")
    .boundingClientRect((value) => {
      if (!value || !page.visible) return;
      if (open && !page.data.showModels) return;
      const rect = value as WechatMiniprogram.BoundingClientRectCallbackResult;
      const top = (info.statusBarHeight || 24) + 44 + 8;
      const safeBottom = info.safeArea ? info.screenHeight - info.safeArea.bottom : 0;
      const below = Math.max(0, info.windowHeight - safeBottom - bar - 12 - (rect.bottom - 12));
      const above = Math.max(0, rect.bottom - 68 - top);
      geometry.set(page, { above, below });
      const place = fit(page, { above, below });
      if (open) page.setData({ modelMenuUp: place.up, modelMenuHeight: place.height });
    })
    .exec();
}

// Preserve the designed downward menu when space permits; flip only to fit.
export function openModelMenu(page: MenuPage) {
  const known = geometry.get(page);
  const place = known ? fit(page, known) : { up: page.data.expanded, height: desiredHeight(page) };
  page.setData({ showModels: true, modelMenuHeight: place.height, modelMenuUp: place.up });
  measureModelMenu(page, true);
}
