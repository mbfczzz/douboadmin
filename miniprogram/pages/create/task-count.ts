import { API_BASE } from "../../config";
import { sessionToken } from "../../services/session";

type Page = { visible: boolean; destroyed: boolean; data: { runningTasks: number }; setData(value: Record<string, unknown>): void };
type Poll = { timer?: ReturnType<typeof setTimeout>; task?: WechatMiniprogram.RequestTask };
const polls = new WeakMap<Page, Poll>();
const setCount = (page: Page, count: number) => {
  if (!page.destroyed && page.data.runningTasks !== count) page.setData({ runningTasks: count });
};

export function stopTaskCount(page: Page) {
  const poll = polls.get(page);
  polls.delete(page);
  if (poll) {
    if (poll.timer !== undefined) clearTimeout(poll.timer);
    poll.task?.abort();
  }
  setCount(page, 0);
}

export function startTaskCount(page: Page) {
  stopTaskCount(page);
  const token = sessionToken();
  if (!token || !page.visible || page.destroyed) return;
  const poll: Poll = {};
  polls.set(page, poll);
  const current = () => polls.get(page) === poll && !page.destroyed && page.visible && sessionToken() === token;
  const refresh = () => {
    if (!current()) { if (polls.get(page) === poll) stopTaskCount(page); return; }
    // A background counter must never open login or activation dialogs.
    poll.task = wx.request({
      url: API_BASE + "/api/jobs?page=1&size=1&status=running&excludeChat=true&excludeImport=true",
      method: "GET", header: { Authorization: "Bearer " + token }, timeout: 10000,
      success(res) {
        if (!current()) return;
        if (res.statusCode === 401 || res.statusCode === 403) { stopTaskCount(page); return; }
        const total = (res.data as { total?: number })?.total;
        setCount(page, res.statusCode === 200 && typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : 0);
      },
      fail() { if (current()) setCount(page, 0); },
      complete() {
        poll.task = undefined;
        if (current()) poll.timer = setTimeout(refresh, 5000);
        else if (polls.get(page) === poll) stopTaskCount(page);
      },
    });
  };
  refresh();
}
