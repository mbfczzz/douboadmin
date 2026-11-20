import { error, submitInput, openTask } from "../../utils/api";
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
  data: { messages: ChatMessage[]; session: SessionDetail | null; materials: Row<Asset>[]; generating: boolean };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  load(force?: boolean): Promise<void>;
  poll(): void;
};

export const generateHandlers = {
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
