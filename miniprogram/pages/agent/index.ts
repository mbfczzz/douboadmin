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
Page({
  data: {
    prompt: "",
    messages: [] as ChatMessage[],
    busy: false,
    bottom: "",
    quick: [
      "帮我写一段产品短视频脚本",
      "为我的照片写创意提示词",
      "策划一个咖啡品牌宣传片",
    ],
  },
  timer: 0,
  fetching: false,
  loadVersion: 0,
  destroyed: false,
  onShow() {
    tab(this, 3);
    void this.load();
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.load();
    }, 3000);
  },
  onHide() {
    clearInterval(this.timer);
  },
  onUnload() {
    this.destroyed = true;
    this.loadVersion++;
    clearInterval(this.timer);
  },
  async load(force = false) {
    if (!hasSession()) {
      this.loadVersion++;
      this.fetching = false;
      this.setData({ messages: [] });
      return;
    }
    if (this.fetching && !force) return;
    const version = ++this.loadVersion;
    this.fetching = true;
    try {
      const jobs = await request<Job[]>("/jobs");
      if (version !== this.loadVersion) return;
      const messages = chatMessages(jobs);
      const changed =
        JSON.stringify(messages) !== JSON.stringify(this.data.messages);
      if (changed)
        this.setData({
          messages,
          bottom: messages.length ? "m" + messages[messages.length - 1].id : "",
        });
    } catch (e) {
      if (version === this.loadVersion && !this.data.messages.length) error(e);
    } finally {
      if (version === this.loadVersion) this.fetching = false;
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ prompt: e.detail.value });
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
