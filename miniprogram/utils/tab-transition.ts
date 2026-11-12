import { switchPageTab } from "./navigation";

export const TAB_ITEMS = [
  {
    text: "模板",
    icon: "app",
    on: "app-filled",
    path: "/pages/templates/index",
  },
  { text: "混剪", icon: "cut", path: "/pages/mix/index" },
  // The centre tab keeps a visible label alongside the primary plus action.
  {
    text: "创作",
    icon: "add",
    primary: true,
    path: "/pages/create/index",
  },
  {
    text: "Agent",
    icon: "chat-bubble",
    on: "chat-bubble-filled",
    path: "/pages/agent/index",
  },
  { text: "我的", icon: "user", on: "user-filled", path: "/pages/mine/index" },
];

export function tabDestination(path: string) {
  return TAB_ITEMS.find((item) => item.path === path);
}

export function openTab(page: object, path: string, onFail?: () => void) {
  if (!tabDestination(path)) return false;
  return switchPageTab(page, path, onFail);
}
