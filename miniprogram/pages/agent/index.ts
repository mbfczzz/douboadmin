import { showArt } from "../../utils/ui-art";
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
import { sentMaterials, planPrompt } from "./plan";
import { editHandlers } from "./edit";
import { chatModel } from "../../services/chat-model";
import { streamHandlers } from "./stream";
import { sessionHandlers, projectView } from "./session";
import { remember } from "./remember";
import { materialHandlers, materialLabels } from "./materials";
import type { Labelled } from "./materials";
import { generateHandlers } from "./generate";


// Agent: one 创作项目 at a time (session.ts). Replies end with a 创作方案
// card that generates (generate.ts) from the project's materials.
Page({
  ...agentModels,
  ...historyHandlers,
  ...editHandlers,
  ...streamHandlers,
  ...sessionHandlers,
  ...materialHandlers,
  ...generateHandlers,
  data: {
    navBottom: 68,
    models: [] as ChatModel[], // chat models to talk to (DeepSeek / 豆包)
    model: "",
    current: null as ChatModel | null, // shown on the model pill
    modelsOpen: false,
    modelPrices: {} as Record<string, string>, // per model, filled when the picker opens
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
    limit: 20000, // characters one message may have: the chosen model's (模型管理) once loaded; the default before
    messages: [] as ChatMessage[],
    busy: false,
    replying: false, // a reply is being written: the send button stops it
    bottom: "",
    hasOlder: false,
    loadingOlder: false,
    focus: false,
    ready: false, // first history load finished (or a cached copy shown)
    // Follow-ups under the latest reply; they fill the composer like starters.
    followUps: [] as string[], // a skill's own revisions for video plans (session.ts)
    examples: [] as string[], // first messages to try in an empty project
    planPrice: { id: "", text: "" }, // the newest plan's points, on 确认生成
    planModels: [] as { id: string; label: string }[], // models that fit it (model-picker)
    planModel: "",
    expanded: {} as Record<string, boolean>, // earlier plans opened to their full card
    attached: [] as Labelled[], // go with the message being written only
    editing: "", // the sent turn being edited (its job id), asked again on send
    files: {} as Record<string, { label: string; thumb: string; video: boolean }>, // sent messages' attachments
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
    this.setData({ navBottom: navBottom() });
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
    if (this.data.uploading) return error(new Error("素材还在上传，稍等一下再发"));
    const attached = this.data.attached as Labelled[];
    // Attachments alone ask for an analysis of them.
    const submitted = this.data.prompt.trim() ? this.data.prompt : attached.length ? (attached.some((m) => !m.isImage) ? "分析这个视频" : "分析这张图片") : "";
    if (!submitted) {
      error(new Error("请输入要发送的内容"));
      return;
    }
    this.setData({ busy: true });
    try {
      const model = await chatModel(this.data.model);
      if (this.destroyed) return;
      if (model.id !== this.data.model) void this.loadModels(); // signed in again: show the picker
      if (!this.data.session) {
        const row = await createSession("general"); // a first message starts a free project
        remember(row.id); // and is the one shown next visit
        this.setData({ session: { ...row, assets: [] }, projects: [projectView(row, this.data.skills), ...this.data.projects] });
        await this.load(true); // adopt the new project before its first turn shows
      }
      // This message's attachments only. Pictures need a model that reads
      // them; videos are watched by 视频理解 for any model.
      if (attached.some((m) => m.isImage) && !(model.referenceTypes || []).includes("image")) throw new Error(`${model.name} 看不到图片，请换成能识图的模型`);
      const assets = attached.map((m) => m.id);
      const job = await submitInput(
        { kind: "chat", model: model.id, prompt: submitted, resolution: "", ratio: "", duration: 0, assets, sessionId: this.data.session!.id, ...(this.data.editing ? { revises: this.data.editing } : {}) },
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
      if (this.data.prompt === submitted || !this.data.prompt.trim()) this.setData({ prompt: "" });
      this.setData({ attached: [], editing: "" }); // the next message starts without them
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
    // The plan's materials, renumbered as the editor will number them (the
    // project's 图片3 alone is the editor's @图片1); a plain reply takes
    // what its question carried.
    const sent = plan ? sentMaterials(planPrompt(plan), this.data.materials) : undefined;
    wx.setStorageSync("edit-draft", {
      kind: plan?.kind || "video",
      // Whole: a revised long prompt keeps its end; the editor shows its own limit.
      prompt: sent?.prompt || m?.text || e.currentTarget.dataset.text || "",
      ratio: plan?.ratio || "9:16",
      resolution: "",
      duration: plan?.kind === "image" ? 0 : plan?.duration || 5,
      assets: sent ? sent.assets.map((a) => a.id) : (this.history as Job[]).find((j) => m && j.id + "a" === m.id)?.input.assets || [],
    });
    openPage(this, { url: "/pages/create/index?kind=" + (plan?.kind || "video") });
  },
});
