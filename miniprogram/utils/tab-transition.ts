import { switchPageTab } from "./navigation";
import { featuredOn, setFeatured } from "./featured-mode";

export const FEATURED_TAB_PATH = "/pages/featured-works/index";
// 优秀 is a view of the 模板 tab page: selecting it is a tab switch.
export const TEMPLATES_TAB_PATH = "/pages/templates/index";

// Tab glyphs were generated with Codex as one bold set (assets/tab, 72px PNG
// with alpha): "-off" in grey, "-on" in white. t-icon names stay as fallback.
const art = (name: string) => ({ art: `/assets/tab/${name}-off.png`, artOn: `/assets/tab/${name}-on.png` });
export const TAB_ITEMS = [
  {
    text: "模板",
    icon: "app",
    on: "app-filled",
    ...art("templates"),
    path: "/pages/templates/index",
  },
  // 混剪 is hidden for now (its page stays reachable from old mix tasks).
  { text: "优秀", icon: "star", on: "star-filled", ...art("featured"), path: FEATURED_TAB_PATH },
  // The centre tab keeps a visible label alongside the primary plus action.
  {
    text: "创作",
    icon: "add",
    primary: true,
    ...art("create"),
    path: "/pages/create/index",
  },
  {
    text: "Agent",
    icon: "chat-bubble",
    on: "chat-bubble-filled",
    ...art("agent"),
    path: "/pages/agent/index",
  },
  { text: "我的", icon: "user", on: "user-filled", ...art("mine"), path: "/pages/mine/index" },
];

export function tabDestination(path: string) {
  return TAB_ITEMS.find((item) => item.path === path);
}

// The page a tab lives on; sets the 模板 page's view for 模板 and 优秀.
export function tabTarget(path: string) {
  if (path === FEATURED_TAB_PATH || path === TEMPLATES_TAB_PATH) {
    setFeatured(path === FEATURED_TAB_PATH);
    return TEMPLATES_TAB_PATH;
  }
  return path;
}

// Which tab a route shows: the 模板 page counts as 优秀 in its featured view.
export function tabIndexOf(route: string) {
  const path = "/" + route.replace(/^\//, "");
  return TAB_ITEMS.findIndex((item) => item.path === (path === TEMPLATES_TAB_PATH && featuredOn() ? FEATURED_TAB_PATH : path));
}

// Already on the 模板 page: switch its view in place (no reload).
export function switchInPlace(target: string) {
  const pages = getCurrentPages(), current = pages[pages.length - 1] as unknown as { route?: string; applyTabView?: () => void };
  if (target !== TEMPLATES_TAB_PATH || "/" + current?.route !== target || !current.applyTabView) return false;
  current.applyTabView();
  return true;
}

export function openTab(page: object, path: string, onFail?: () => void) {
  if (!tabDestination(path)) return false;
  const target = tabTarget(path);
  if (switchInPlace(target)) return true;
  return switchPageTab(page, target, onFail);
}
