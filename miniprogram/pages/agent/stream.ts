import { request } from "../../services/request";
import { openReplyStream } from "../../services/chat-stream";
import { error } from "../../utils/api";
import { chatMessages } from "../../utils/chat";
import type { ChatMessage } from "../../utils/chat";
import type { Job } from "../../services/types";

// A reply being written is shown as it grows: read as a stream where the
// runtime can, otherwise asked for every half second.
type Page = {
  data: { messages: ChatMessage[]; bottom: string };
  history: Job[];
  partials: Record<string, string>;
  streamId: string;
  streamTimer: number;
  streamClose?: () => void;
  streamEnded?: { id: string; at: number };
  follow: boolean;
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  load(force?: boolean): Promise<void>;
  stream(): void;
  stopStream(): void;
};
type Reply = { status: string; text: string };
export const STREAM_MS = 500;
const writing = (j: Job) => j.input.kind === "chat" && /queued|running/.test(j.status);
export const replying = (messages: ChatMessage[]) => messages.some((m) => m.role === "assistant" && m.pending);

function show(page: Page, id: string, text: string) {
  if (page.streamId !== id || !text || text === page.partials[id]) return;
  page.partials = { ...page.partials, [id]: text };
  const messages = chatMessages(page.history, page.partials);
  // Keep the newest words in view unless the reader scrolled up.
  const bottom = page.data.bottom === "end-a" ? "end-b" : "end-a";
  page.setData(page.follow ? { messages, bottom, replying: true } : { messages, replying: true });
}

function ended(page: Page, id: string) {
  page.streamId = "";
  page.streamEnded = { id, at: Date.now() };
  void page.load(true); // the whole reply (and its plan card)
}

// Fallback: the reply so far, every half second.
function poll(page: Page, id: string) {
  const tick = async () => {
    try {
      const r = await request<Reply>(`/jobs/${id}/reply`);
      if (page.streamId !== id || page.destroyed) return;
      if (r.status !== "running" && r.status !== "queued") return ended(page, id);
      show(page, id, r.text);
    } catch {
      if (page.streamId === id) page.streamId = ""; // the regular check restarts it
      return;
    }
    if (page.streamId === id) page.streamTimer = setTimeout(tick, STREAM_MS) as unknown as number;
  };
  void tick();
}

export const streamHandlers = {
  stream(this: Page) {
    const job = this.history.find(writing);
    if (!job || this.streamId === job.id) return;
    // Just ended but the list still says writing: let the regular check catch up.
    if (this.streamEnded?.id === job.id && Date.now() - this.streamEnded.at < 2000) return;
    const id = (this.streamId = job.id);
    const opened = Date.now();
    const close = openReplyStream(id, {
      text: (whole) => show(this, id, whole),
      end: (how) => {
        if (this.streamId !== id || this.destroyed) return;
        this.streamClose = undefined;
        if (how === "done") return ended(this, id);
        // A long reply outlived one stream: read on. A stream that ends at
        // once or fails (proxy, old runtime) falls back to asking.
        if (how === "again" && Date.now() - opened > 3000) {
          this.streamId = "";
          return this.stream();
        }
        poll(this, id);
      },
    });
    if (close) this.streamClose = close;
    else poll(this, id);
  },
  stopStream(this: Page) {
    this.streamId = "";
    clearTimeout(this.streamTimer);
    this.streamClose?.();
    this.streamClose = undefined;
  },
  // 停止回复: what was written is kept (and charged); nothing written is refunded.
  async stopReply(this: Page) {
    const job = this.history.find(writing);
    if (!job) return;
    try {
      await request(`/jobs/${job.id}/stop`, "POST", {});
      void this.load(true);
    } catch (e) {
      error(e);
    }
  },
  // Scrolling up stops following the reply; reaching the bottom resumes it.
  chatScroll(this: Page, e: WechatMiniprogram.ScrollViewScroll) {
    if (e.detail.deltaY > 0) this.follow = false;
  },
  chatBottom(this: Page) {
    this.follow = true;
  },
};
