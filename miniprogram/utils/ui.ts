import { AuthCancelledError, errorMessage } from "../services/errors";
import { media } from "../services/media";
import type { Job } from "../services/types";
import { enterPage } from "./motion";
import { openPage } from "./navigation";
import { track } from "../services/analytics";
// Saving to the album failed. Once permission is denied WeChat never asks
// again, so offer the settings page; a cancelled picker says nothing.
export function saveFailed(e: unknown) {
  const msg = String((e as { errMsg?: string })?.errMsg || "");
  if (msg.includes("cancel")) return;
  if (msg.includes("auth"))
    wx.showModal({
      title: "需要相册权限",
      content: "请在设置中允许保存到相册，返回后再次点击保存。",
      success: (r) => {
        if (r.confirm) wx.openSetting({});
      },
    });
  else error(e instanceof Error ? e : new Error("保存失败，请重试"));
}
export function error(e: unknown) {
  if (e instanceof AuthCancelledError) return;
  wx.showToast({
    title: errorMessage(e),
    icon: "none",
    duration: 3000,
  });
}
export function tab(page: any, index: number) {
  track("page_view", ["templates", "mix", "create", "agent", "mine"][index]);
  enterPage(page);
  const select = (bar: any) => {
    if (bar && (bar.data?.selected !== index || bar.data?.switching))
      bar.setData({ selected: index, switching: false });
  };
  select(page.getTabBar?.(select));
}
export function date(s: string) {
  const d = new Date(s);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export const states: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "生成失败",
};
export const kinds: Record<string, string> = {
  video: "视频",
  image: "图片",
  mix: "混剪",
  chat: "对话",
  audio: "配音",
  import: "素材导入",
};
export function jobView(j: Job) {
  return {
    ...j,
    // Import jobs come without reference assets (null from older servers).
    input: { ...j.input, assets: j.input.assets || [] },
    stateText: states[j.status],
    kindText: kinds[j.input.kind],
    modelName: j.modelName || j.input.model,
    time: date(j.createdAt),
    result: j.result && j.input.kind !== "chat" ? media(j.result) : j.result,
    shortTitle: j.input.prompt.slice(0, 24),
  };
}
export function openTask(id: string, page?: object) {
  const options = { url: "/pages/task-detail/index?id=" + id };
  if (page) openPage(page, options);
  else wx.navigateTo(options);
}
