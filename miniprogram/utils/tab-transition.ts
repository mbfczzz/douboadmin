import { openPage } from "./navigation";

export const TAB_ITEMS = [
  { text: "模板", icon: "app", path: "/pages/templates/index" },
  { text: "混剪", icon: "cut", path: "/pages/mix/index" },
  { text: "创作", icon: "add-rectangle", path: "/pages/create/index" },
  { text: "Agent", icon: "chat-bubble", path: "/pages/agent/index" },
  { text: "我的", icon: "user", path: "/pages/mine/index" },
];

export function tabDestination(path: string) {
  return TAB_ITEMS.find((item) => item.path === path);
}

export function openTab(page: object, path: string, onFail?: () => void) {
  if (!tabDestination(path)) return false;
  return openPage(page, {
    url: "/pages/transition/index?target=" + encodeURIComponent(path),
    fail() {
      onFail?.();
      wx.showToast({ title: "页面打开失败，请重试", icon: "none" });
    },
  });
}
