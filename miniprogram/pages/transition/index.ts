import { tabDestination } from "../../utils/tab-transition";

// Keep the intermediate screen visible instead of instantly replacing it.
const HOLD_MS = 600;
const HEADINGS: Record<string, string> = {
  "/pages/templates/index": "去模板里找点灵感",
  "/pages/mix/index": "去剪片啦",
  "/pages/create/index": "去创作啦",
  "/pages/agent/index": "找 Agent 聊聊",
  "/pages/mine/index": "回我的空间",
};

Page({
  data: {
    targetLabel: "页面",
    heading: "出发啦",
    error: "",
    valid: false,
    navigating: false,
  },
  target: "",
  ready: false,
  visible: false,
  destroyed: false,
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  onLoad(query: Record<string, string>) {
    let target = "";
    try {
      target = decodeURIComponent(query.target || "");
    } catch {
      /* invalid target */
    }
    const destination = tabDestination(target);
    if (!destination) {
      this.setData({ error: "目标页面不存在，请返回后重试。" });
      return;
    }
    this.target = destination.path;
    this.setData({
      targetLabel: destination.text === "我的" ? "个人中心" : destination.text,
      heading: HEADINGS[destination.path],
      valid: true,
    });
  },
  onShow() {
    this.visible = true;
    this.schedule();
  },
  onReady() {
    this.ready = true;
    this.schedule();
  },
  onHide() {
    this.visible = false;
    this.stopTimer();
  },
  onUnload() {
    this.destroyed = true;
    this.visible = false;
    this.stopTimer();
  },
  stopTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  },
  schedule() {
    if (
      !this.ready ||
      !this.visible ||
      this.destroyed ||
      !this.target ||
      this.data.navigating ||
      this.data.error ||
      this.timer !== undefined
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.enter();
    }, HOLD_MS);
  },
  enter() {
    if (!this.visible || this.destroyed || !this.target || this.data.navigating)
      return;
    this.setData({ navigating: true });
    const fail = () => {
      if (this.destroyed) return;
      this.setData({
        navigating: false,
        error: "点一下重试，或者返回上一页。",
      });
    };
    try {
      wx.switchTab({ url: this.target, fail });
    } catch {
      fail();
    }
  },
  retry() {
    if (this.data.navigating || !this.target) return;
    this.setData({ error: "" });
    this.schedule();
  },
});
