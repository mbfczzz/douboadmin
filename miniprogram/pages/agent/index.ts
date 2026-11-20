import { showArt } from "../../utils/ui-art";
import { loadConfig } from "../../utils/config-cache";
import { error, tab, submitInput, openPage } from "../../utils/api";
import type { Job } from "../../services/types";
import type { ChatMessage } from "../../utils/chat";
import { chatMessages } from "../../utils/chat";
import { navBottom } from "../../utils/nav-metrics";
import { createSession } from "../../services/agent";
import type { Skill, SessionDetail } from "../../services/agent";
import type { ProjectView } from "./session";
import { agentModels } from "./models";
import type { ChatModel } from "./models";
import { historyHandlers } from "./history";
import { chatOf } from "../../services/chat-model";
import { streamHandlers } from "./stream";
import { sessionHandlers, projectView } from "./session";
import { materialHandlers, materialLabels } from "./materials";
import { generateHandlers } from "./generate";
import { namedPictures } from "./named";

// Agent: one 创作项目 at a time (session.ts). Replies end with a 创作方案
// card that generates (generate.ts) from the project's materials.
Page({
  ...agentModels,
  ...historyHandlers,
  ...streamHandlers,
  ...sessionHandlers,
  ...materialHandlers,
  ...generateHandlers,
  data: {
    navBottom: 68,
    models: [] as ChatModel[], // chat models to talk to (DeepSeek / 豆包)
    model: "",
    sees: false, // the chosen chat model reads pictures
    priceHint: "",
    session: null as SessionDetail | null,
    projects: [] as ProjectView[],
    projectsOpen: false,
    projectsReady: false, // projects and skills have loaded once
    projectsError: "",
    skills: [] as Skill[],
    materials: [] as ReturnType<typeof materialLabels>,
    thumbs: {} as Record<string, string>, // "图片1" -> its picture, for plan cards
    uploading: false,
    generating: false,
    prompt: "",
    messages: [] as ChatMessage[],
    busy: false,
    replying: false, // a reply is being written: the send button stops it
    bottom: "",
    hasOlder: false,
    loadingOlder: false,
    focus: false,
    ready: false, // first history load finished (or a cached copy shown)
    // Follow-ups under the latest reply; they fill the composer like starters.
    followUps: ["缩短到 10 秒", "换一个开场", "改成横屏"], // per skill (session.ts)
    examples: [] as string[], // first messages to try in an empty project
    planPrice: { id: "", text: "" }, // the newest plan's points, on 确认生成
    expanded: {} as Record<string, boolean>, // earlier plans opened to their full card
    compact: false, // short screens fold the materials strip to one line
    short: false,
    compactPicked: false, // the user chose, so a resize does not override
    art: {} as Record<string, string>,
  },
  timer: 0,
  fetching: false,
  failed: false,
  loadVersion: 0,
  destroyed: false,
  historyPage: 1,
  history: [] as Job[],
  historyKey: "",
  partials: {} as Record<string, string>,
  streamId: "",
  streamTimer: 0,
  streamClose: undefined as undefined | (() => void),
  follow: true,
  onShow() {
    this.onResize();
    showArt(this, (art) => ({ art: { product: art.skillProduct, store: art.skillStore, image: art.skillImage, general: art.skillGeneral } }));
    tab(this, 3);
    void this.loadModels().catch(() => undefined);
    void this.loadSession()
      .catch((e: Error) => !this.destroyed && this.setData({ projectsError: e.message || "加载失败" }))
      .then(() => this.load())
      .then(() => this.poll());
  },
  onResize() {
    const short = wx.getWindowInfo().windowHeight < 700;
    this.setData({ navBottom: navBottom(), short, ...(this.data.compactPicked ? {} : { compact: short }) });
  },
  toggleMaterials() {
    this.setData({ compact: !this.data.compact, compactPicked: true });
  },
  onHide() {
    this.loadVersion++;
    this.fetching = false;
    this.setData({ loadingOlder: false });
    clearInterval(this.timer);
    this.stopStream();
  },
  onUnload() {
    this.destroyed = true;
    this.loadVersion++;
    clearInterval(this.timer);
    this.stopStream();
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ prompt: e.detail.value });
  },
  quick(e: WechatMiniprogram.TouchEvent) {
    this.setData({ prompt: e.currentTarget.dataset.value, focus: true });
  },
  // A failed reply puts its question back in the composer to edit and resend.
  retry(e: WechatMiniprogram.TouchEvent) {
    this.setData({ prompt: e.currentTarget.dataset.prompt || "", focus: true });
  },
  blur() {
    this.setData({ focus: false });
  },
  copy(e: WechatMiniprogram.TouchEvent) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text });
  },
  async send() {
    if (this.data.busy) return;
    // The next turn is read with this reply as context, so wait for it
    // (unless it has been stuck for two minutes).
    const writing = (j: Job) => j.input.kind === "chat" && /queued|running/.test(j.status) && Date.now() - new Date(j.createdAt || 0).getTime() < 120000;
    if (this.history.some(writing)) {
      error(new Error("上一条还在回复，稍等一下再发"));
      return;
    }
    if (!this.data.prompt.trim()) {
      error(new Error("请输入要发送的内容"));
      return;
    }
    this.setData({ busy: true });
    const submitted = this.data.prompt;
    try {
      const config = await loadConfig();
      if (this.destroyed) return;
      const model = config.models.find((m) => m.kind === "chat" && m.id === this.data.model) || chatOf(config);
      if (!model) throw new Error("创作助手暂未开放，请稍后再试");
      if (!this.data.session) {
        const row = await createSession("general"); // a first message starts a free project
        this.setData({ session: { ...row, assets: [] }, projects: [projectView(row, this.data.skills), ...this.data.projects] });
        await this.load(true); // adopt the new project before its first turn shows
      }
      // Pictures go to models that read them, and only those this message
      // names: every extra picture is read again and slows the reply.
      const sees = (model.referenceTypes || []).includes("image");
      const assets = sees ? namedPictures(submitted, this.data.materials) : [];
      const job = await submitInput(
        { kind: "chat", model: model.id, prompt: submitted, resolution: "", ratio: "", duration: 0, assets, sessionId: this.data.session!.id },
        "agent",
        true, // the composer already shows the price; no dialog per message
      );
      if (this.destroyed) return;
      const added = chatMessages([job]);
      this.follow = true; // a new question follows its reply down
      this.setData({
        messages: [...this.data.messages.filter((m: ChatMessage) => !added.some((item) => item.id === m.id)), ...added],
        bottom: "m" + job.id + "a",
        replying: true,
      });
      if (this.data.prompt === submitted) this.setData({ prompt: "" });
      await this.load(true);
      this.poll();
    } catch (e) {
      error(e);
      // Deleted on another device: fall back to the remaining projects.
      if (!this.destroyed && /创作项目不存在/.test((e as Error)?.message || "")) void this.loadSession().then(() => this.load(true));
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  // 去编辑页精调: the plan (or reply) opens in the editor.
  use(e: WechatMiniprogram.TouchEvent) {
    const m = this.data.messages[Number(e.currentTarget.dataset.index)] as ChatMessage | undefined;
    const plan = m?.plan;
    wx.setStorageSync("edit-draft", {
      kind: plan?.kind || "video",
      prompt: (plan?.prompt || m?.text || e.currentTarget.dataset.text || "").slice(0, 2000),
      ratio: plan?.ratio || "9:16",
      resolution: "",
      duration: plan?.kind === "image" ? 0 : plan?.duration || 5,
      assets: this.data.materials.map((x: { id: string }) => x.id),
    });
    openPage(this, { url: "/pages/create/index?kind=" + (plan?.kind || "video") });
  },
});
