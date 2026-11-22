import { loadConfig } from "../../utils/config-cache";
import { request } from "../../services/request";
import { points } from "../../services/business";
import { hasSession } from "../../utils/api";
import type { Config } from "../../services/types";
import { CHAT_CHOICE, DEFAULT_CHAT, preferredChat } from "../../services/chat-model";

// Which chat model the Agent talks to (DeepSeek / 豆包 / relay chat models),
// remembered across visits, and what one turn costs on it.
// sees: reads pictures; rec: the recommended default; desc: one line for the picker.
// watches: no chat model takes videos itself any more; the server has 视频理解 watch each video once.
export type ChatModel = { id: string; name: string; sees: boolean; watches: boolean; key?: string; icon: string; desc: string; rec: boolean };
const STORE = CHAT_CHOICE;

export const chatModels = (config: Config): ChatModel[] =>
  config.models
    .filter((m) => m.kind === "chat")
    .map((m) => ({ id: m.id, name: m.name, key: m.key, icon: m.icon || "", desc: m.settings?.description || "", rec: m.key === DEFAULT_CHAT, sees: (m.referenceTypes || []).includes("image"), watches: (m.referenceTypes || []).includes("video") }));

type Quote = { units: number; billingEnabled: boolean; perToken?: boolean };
// 按量 models: the most one turn can hold; settled on the tokens used.
async function priceHint(model: string): Promise<string> {
  if (!hasSession()) return "";
  try {
    const q = await request<Quote>("/jobs/quote", "POST", { kind: "chat", model, prompt: "预估本轮积分", resolution: "", ratio: "", duration: 0, assets: [], purpose: "agent" });
    if (!q.billingEnabled || !q.units) return "";
    return q.perToken ? `每轮最多约 ${points(q.units)} 积分` : `每轮 ${points(q.units)} 积分`;
  } catch {
    return ""; // preview accounts cannot quote; the hint is optional
  }
}

type Page = {
  data: { models: ChatModel[]; model: string; modelPrices: Record<string, string> };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

export const agentModels = {
  async loadModels(this: Page) {
    const models = chatModels(await loadConfig());
    if (this.destroyed) return;
    const saved = wx.getStorageSync(STORE) as string;
    const current = preferredChat(models, saved);
    const model = current?.id || "";
    this.setData({ models, model, current: current || null, sees: !!current?.sees });
    if (model) {
      const hint = await priceHint(model);
      if (!this.destroyed && this.data.model === model) this.setData({ priceHint: hint });
    }
  },
  // The picker sheet: each model with what one turn can cost on it.
  openModels(this: Page) {
    if (this.data.models.length < 2) return;
    this.setData({ modelsOpen: true });
    for (const m of this.data.models)
      if (!this.data.modelPrices[m.id])
        void priceHint(m.id).then((text) => !this.destroyed && text && this.setData({ modelPrices: { ...this.data.modelPrices, [m.id]: text } }));
  },
  closeModels(this: Page) {
    this.setData({ modelsOpen: false });
  },
  async pickModel(this: Page, e: WechatMiniprogram.TouchEvent) {
    const model = e.currentTarget.dataset.id as string;
    this.setData({ modelsOpen: false });
    if (model === this.data.model) return;
    wx.setStorageSync(STORE, model);
    const current = this.data.models.find((m) => m.id === model);
    this.setData({ model, current, priceHint: this.data.modelPrices[model] || "", sees: !!current?.sees });
    const hint = await priceHint(model);
    if (!this.destroyed && this.data.model === model) this.setData({ priceHint: hint });
  },
};
