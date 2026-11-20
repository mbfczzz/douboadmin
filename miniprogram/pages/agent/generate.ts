import { error, submitInput, openTask, request } from "../../utils/api";
import { points } from "../../services/business";
import { loadConfig } from "../../utils/config-cache";
import { rememberRows } from "../../utils/view-cache";
import { planInput } from "./plan";
import type { ChatMessage } from "../../services/types";
import type { SessionDetail } from "../../services/agent";
import type { Row, Asset } from "../../services/types";

// 确认生成 on the newest plan: the first model that takes its materials,
// the price confirmed once (the usual dialog), then the generation joins
// the conversation as its own card.
type Page = {
  data: { messages: ChatMessage[]; session: SessionDetail | null; materials: Row<Asset>[]; generating: boolean; planPrice: { id: string; text: string } };
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
    const key = message.id + ":" + this.data.materials.map((m) => m.id).join(",");
    if (this.priceKey === key) return;
    this.priceKey = key;
    let text = "";
    try {
      const config = await loadConfig();
      const q = await request<Quote>("/jobs/quote", "POST", planInput(message.plan, config.models, this.data.materials, session.id));
      text = !q.billingEnabled || !q.units ? "不扣积分" : points(q.units) + " 积分";
    } catch {
      text = ""; // no model fits, or a preview account: the dialog still says it
    }
    if (!this.destroyed && this.priceKey === key) this.setData({ planPrice: { id: message.id, text } });
  },
  async generatePlan(this: Page, e: WechatMiniprogram.TouchEvent) {
    const message = this.data.messages[Number(e.currentTarget.dataset.index)];
    const session = this.data.session;
    if (!message?.plan || !message.latest || !session || this.data.generating) return;
    this.setData({ generating: true });
    try {
      const config = await loadConfig();
      const job = await submitInput(planInput(message.plan, config.models, this.data.materials, session.id), "agent-gen");
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
  openGen(this: Page, e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
};
