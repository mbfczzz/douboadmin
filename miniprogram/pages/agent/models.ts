import { loadConfig } from "../../utils/config-cache";
import { request } from "../../services/request";
import { points } from "../../services/business";
import { hasSession } from "../../utils/api";
import type { Config } from "../../services/types";
import { CHAT_CHOICE, preferredChat } from "../../services/chat-model";

// Which chat model the Agent talks to (DeepSeek / 豆包 / relay chat models),
// remembered across visits, and what one turn costs on it.
export type ChatModel = { id: string; name: string; sees: boolean; key?: string }; // sees: reads pictures
const STORE = CHAT_CHOICE;

export const chatModels = (config: Config): ChatModel[] =>
  config.models.filter((m) => m.kind === "chat").map((m) => ({ id: m.id, name: m.name, key: m.key, sees: (m.referenceTypes || []).includes("image") }));

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
  data: { models: ChatModel[]; model: string };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

export const agentModels = {
  async loadModels(this: Page) {
    const models = chatModels(await loadConfig());
    if (this.destroyed) return;
    const saved = wx.getStorageSync(STORE) as string;
    const model = preferredChat(models, saved)?.id || "";
    this.setData({ models, model, sees: !!models.find((m) => m.id === model)?.sees });
    if (model) {
      const hint = await priceHint(model);
      if (!this.destroyed && this.data.model === model) this.setData({ priceHint: hint });
    }
  },
  async pickModel(this: Page, e: WechatMiniprogram.TouchEvent) {
    const model = e.currentTarget.dataset.id as string;
    if (model === this.data.model) return;
    wx.setStorageSync(STORE, model);
    this.setData({ model, priceHint: "", sees: !!this.data.models.find((m) => m.id === model)?.sees });
    const hint = await priceHint(model);
    if (!this.destroyed && this.data.model === model) this.setData({ priceHint: hint });
  },
};
