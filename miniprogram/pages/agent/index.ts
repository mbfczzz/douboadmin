import {
  request,
  error,
  tab,
  submitInput,
  hasSession,
  openTab,
} from "../../utils/api";
import type { Job, Config } from "../../services/types";
import { chatMessages } from "../../utils/chat";
import type { ChatMessage } from "../../utils/chat";
import { jobPage } from "../../services/job-pages";
import { sessionToken } from "../../services/session";
Page({
  data: {
    prompt: "",
    messages: [] as ChatMessage[],
    busy: false,
    bottom: "",
    hasOlder: false,
    loadingOlder: false,
    quick: [
      "帮我写一段产品短视频脚本",
      "为我的照片写创意提示词",
      "策划一个咖啡品牌宣传片",
    ],
  },
  timer: 0,
  fetching: false,
  failed: false,
  loadVersion: 0,
  destroyed: false,
  historyPage: 1,
  history: [] as Job[],
  historyToken: "",
  onShow() {
    tab(this, 3);
    void this.load();
    this.poll();
  },
  // Poll only while a reply may still arrive; load() stops it when idle.
  poll() {
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.load(), 3000);
  },
  onHide() {
    this.loadVersion++;
    this.fetching = false;
    this.setData({ loadingOlder: false });
    clearInterval(this.timer);
  },
  onUnload() {
    this.destroyed = true;
    this.loadVersion++;
    clearInterval(this.timer);
  },
  async load(force = false) {
    const token = sessionToken();
    if (token !== this.historyToken) {
      this.historyToken = token;
      this.history = [];
      this.historyPage = 1;
      this.setData({ messages: [], hasOlder: false });
    }
    if (!hasSession()) {
      this.loadVersion++;
      this.fetching = false;
      this.history = [];
      this.historyPage = 1;
      this.setData({ messages: [] });
      return;
    }
    if (this.fetching && !force) return;
    const version = ++this.loadVersion;
    this.fetching = true;
    try {
      const result = await jobPage(1, "&kind=chat");
      const fresh = result.items;
      const jobs = [
        ...fresh,
        ...this.history.filter((j: Job) => !fresh.some((n) => n.id === j.id)),
      ];
      if (version !== this.loadVersion) return;
      this.failed = false;
      this.history = jobs;
      this.setData({ hasOlder: jobs.length < result.total });
      if (
        !jobs.some(
          (j) => j.input.kind === "chat" && /queued|running/.test(j.status),
        )
      )
        clearInterval(this.timer);
      const messages = chatMessages(jobs);
      const changed =
        JSON.stringify(messages) !== JSON.stringify(this.data.messages);
      if (changed)
        this.setData({
          messages,
          bottom: messages.length ? "m" + messages[messages.length - 1].id : "",
        });
    } catch (e) {
      // One toast per outage, not one every poll.
      if (version !== this.loadVersion) return;
      if (!this.failed) error(e);
      this.failed = true;
    } finally {
      if (version === this.loadVersion) this.fetching = false;
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ prompt: e.detail.value });
  },
  async older() {
    if (this.data.loadingOlder || !this.data.hasOlder) return;
    const version = this.loadVersion;
    this.setData({ loadingOlder: true });
    try {
      const result = await jobPage(this.historyPage + 1, "&kind=chat");
      if (version !== this.loadVersion) return;
      this.historyPage++;
      this.history = [
        ...this.history,
        ...result.items.filter(
          (j) => !this.history.some((old: Job) => old.id === j.id),
        ),
      ];
      this.setData({
        messages: chatMessages(this.history),
        hasOlder: this.history.length < result.total,
      });
    } catch (e) {
      if (version === this.loadVersion) error(e);
    } finally {
      if (version === this.loadVersion && !this.destroyed) this.setData({ loadingOlder: false });
    }
  },
  quick(e: WechatMiniprogram.TouchEvent) {
    this.setData({ prompt: e.currentTarget.dataset.value });
  },
  async send() {
    if (this.data.busy) return;
    if (!this.data.prompt.trim()) {
      error(new Error("请输入要发送的内容"));
      return;
    }
    this.setData({ busy: true });
    const submitted = this.data.prompt;
    try {
      const config = await request<Config>(
        "/config",
        "GET",
        undefined,
        undefined,
        false,
      );
      if (this.destroyed) return;
      const model = config.models.find((m) => m.kind === "chat");
      if (!model) throw new Error("创作助手暂未开放，请稍后再试");
      const job = await submitInput(
        {
          kind: "chat",
          model: model.id,
          prompt: submitted,
          resolution: "",
          ratio: "",
          duration: 0,
          assets: [],
        },
        "agent",
      );
      if (this.destroyed) return;
      const added = chatMessages([job]);
      this.setData({
        messages: [
          ...this.data.messages.filter(
            (message: ChatMessage) =>
              !added.some((item) => item.id === message.id),
          ),
          ...added,
        ],
        bottom: "m" + job.id + "a",
      });
      if (this.data.prompt === submitted) this.setData({ prompt: "" });
      await this.load(true);
      this.poll();
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  use(e: WechatMiniprogram.TouchEvent) {
    const text = e.currentTarget.dataset.text;
    wx.setStorageSync("edit-draft", {
      kind: "video",
      prompt: text.slice(0, 500),
      ratio: "9:16",
      resolution: "768p",
      duration: 5,
    });
    openTab(this, "/pages/create/index");
  },
});
