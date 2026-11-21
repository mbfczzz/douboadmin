import { error, submitInput, openTask, request } from "../../utils/api";
import { points } from "../../services/business";
import { loadConfig } from "../../utils/config-cache";
import { rememberRows } from "../../utils/view-cache";
import { planInput, planModels } from "./plan";
import { pickerItems, savedModel, saveModel } from "../../utils/model-pick";
import type { ChatMessage } from "../../services/types";
import type { SessionDetail } from "../../services/agent";
import type { Row, Asset } from "../../services/types";

// 确认生成 on the newest plan: the first model that takes its materials,
// the price confirmed once (the usual dialog), then the generation joins
// the conversation as its own card.
type Page = {
  data: { messages: ChatMessage[]; session: SessionDetail | null; materials: Row<Asset>[]; generating: boolean; planPrice: { id: string; text: string }; expanded: Record<string, boolean>; planModel: string };
  destroyed: boolean;
  priceKey?: string;
  setData(data: Record<string, unknown>): void;
  load(force?: boolean): Promise<void>;
  poll(): void;
};

type Quote = { units: number; billingEnabled: boolean };

export const generateHandlers = {
  // The newest plan's points, shown on its 确认生成 before the tap; quoted
  // again when the plan or the materials change. Failures just hide it.
  async priceLatest(this: Page) {
    const messages = this.data.messages;
    let i = messages.length - 1;
    while (i >= 0 && !messages[i].latest) i--;
    const message = messages[i], session = this.data.session;
    if (!message?.plan || !session) return;
    const key = message.id + ":" + this.data.materials.map((m) => m.id).join(",") + ":" + this.data.planModel;
    if (this.priceKey === key) return;
    this.priceKey = key;
    let text = "", failed = false;
    try {
      const config = await loadConfig();
      // The models that fit this plan; the pick stays while it fits, else
      // the last one picked for this kind, else the first.
      const fits = planModels(message.plan, config.models, this.data.materials);
      const model = (fits.find((m) => m.id === this.data.planModel) || savedModel("agent-" + message.plan.kind, fits))?.id || "";
      if (this.destroyed || this.priceKey !== key) return;
      this.setData({ planModels: pickerItems(fits), planModel: model });
      this.priceKey = key.slice(0, key.lastIndexOf(":") + 1) + model;
      const q = await request<Quote>("/jobs/quote", "POST", planInput(message.plan, config.models, this.data.materials, session.id, model));
      text = !q.billingEnabled || !q.units ? "不扣积分" : points(q.units) + " 积分";
    } catch {
      text = ""; // no model fits, or a preview account: the dialog still says it
      failed = true;
    }
    if (!this.destroyed && (this.priceKey || "").startsWith(message.id + ":")) {
      this.setData({ planPrice: { id: message.id, text } });
      if (failed) this.priceKey = ""; // a network failure is tried again next time
    }
  },
  async generatePlan(this: Page, e: WechatMiniprogram.TouchEvent) {
    const message = this.data.messages[Number(e.currentTarget.dataset.index)];
    const session = this.data.session;
    // The newest plan, or an earlier one the user opened to use instead.
    if (!message?.plan || !(message.latest || this.data.expanded[message.id]) || !session || this.data.generating) return;
    this.setData({ generating: true });
    try {
      const config = await loadConfig();
      const job = await submitInput(planInput(message.plan, config.models, this.data.materials, session.id, this.data.planModel), "agent-gen");
      rememberRows([job]);
      if (this.destroyed) return;
      await this.load(true);
      this.poll();
    } catch (err) {
      if (!this.destroyed) error(err); // a declined charge stays silent
    } finally {
      if (!this.destroyed) this.setData({ generating: false });
    }
  },
  // 确认生成's model (the plan card's picker): remembered per kind, priced again.
  choosePlanModel(this: Page, e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const plan = this.data.messages.find((m) => m.latest)?.plan;
    if (plan) saveModel("agent-" + plan.kind, e.detail.id);
    this.setData({ planModel: e.detail.id });
    void (this as unknown as { priceLatest(): Promise<void> }).priceLatest();
  },
  // An earlier plan opens to its full card (and can be used), or folds back.
  togglePlan(this: Page, e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    this.setData({ expanded: { ...this.data.expanded, [id]: !this.data.expanded[id] } });
  },
  openGen(this: Page, e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
};
