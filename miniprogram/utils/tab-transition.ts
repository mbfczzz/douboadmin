import { switchPageTab } from "./navigation";

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
  { text: "混剪", icon: "cut", ...art("mix"), path: "/pages/mix/index" },
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

export function openTab(page: object, path: string, onFail?: () => void) {
  if (!tabDestination(path)) return false;
  return switchPageTab(page, path, onFail);
}
