import { request } from "../../services/request";
import { chatMessages } from "../../utils/chat";
import type { ChatMessage } from "../../utils/chat";
import type { Job } from "../../services/types";

// A reply being written is read every 0.5 s and shown as it grows, so the
// first words appear within a second or two instead of after the whole reply.
type Page = {
  data: { messages: ChatMessage[]; bottom: string };
  history: Job[];
  partials: Record<string, string>;
  streamId: string;
  streamTimer: number;
  follow: boolean;
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  load(force?: boolean): Promise<void>;
};
type Reply = { status: string; text: string };
export const STREAM_MS = 500;

export const streamHandlers = {
  stream(this: Page) {
    const job = this.history.find((j) => j.input.kind === "chat" && j.status === "running");
    if (!job || this.streamId === job.id) return;
    const id = (this.streamId = job.id);
    const tick = async () => {
      try {
        const r = await request<Reply>(`/jobs/${id}/reply`);
        if (this.streamId !== id || this.destroyed) return;
        if (r.status !== "running") {
          this.streamId = "";
          void this.load(true); // the whole reply (and its plan card)
          return;
        }
        if (r.text && r.text !== this.partials[id]) {
          this.partials = { ...this.partials, [id]: r.text };
          const messages = chatMessages(this.history, this.partials);
          // Keep the newest words in view unless the reader scrolled up.
          this.setData(this.follow ? { messages, bottom: this.data.bottom === "end-a" ? "end-b" : "end-a" } : { messages });
        }
      } catch {
        // The regular check carries on and restarts streaming.
        if (this.streamId === id) this.streamId = "";
        return;
      }
      if (this.streamId === id) this.streamTimer = setTimeout(tick, STREAM_MS) as unknown as number;
    };
    void tick();
  },
  stopStream(this: Page) {
    this.streamId = "";
    clearTimeout(this.streamTimer);
  },
  // Scrolling up stops following the reply; reaching the bottom resumes it.
  chatScroll(this: Page, e: WechatMiniprogram.ScrollViewScroll) {
    if (e.detail.deltaY > 0) this.follow = false;
  },
  chatBottom(this: Page) {
    this.follow = true;
  },
};
