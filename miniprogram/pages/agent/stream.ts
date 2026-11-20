import { request } from "../../services/request";
import { openReplyStream } from "../../services/chat-stream";
import { error } from "../../utils/api";
import { chatMessages, streaming } from "../../utils/chat";
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
  typer?: { id: string; target: string; shown: number; timer: number; scrolled: number };
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

// Text arrives in bursts (network, server saves); it is typed out evenly
// every 50 ms instead, faster when more is waiting, so it reads smoothly.
const TYPE_MS = 50;

function show(page: Page, id: string, text: string) {
  if (page.streamId !== id || !text) return;
  const t = page.typer?.id === id ? page.typer : (page.typer = { id, target: "", shown: (page.partials[id] || "").length, timer: 0, scrolled: 0 });
  if (text.length < t.shown) t.shown = 0; // a reconnect resent a different start
  t.target = text;
  if (!t.timer) t.timer = setTimeout(() => type(page), TYPE_MS) as unknown as number;
}

// One step, then the next while text is waiting (idle once caught up).
function type(page: Page) {
  const t = page.typer;
  if (!t || page.destroyed) return stopTyping(page);
  t.timer = 0;
  const backlog = t.target.length - t.shown;
  if (backlog <= 0) return;
  t.shown += Math.max(1, Math.ceil(backlog / 6)); // a burst drains in about 0.3 s
  // Never stop between the two halves of an emoji (UTF-16 surrogates).
  const last = t.target.charCodeAt(t.shown - 1);
  if (last >= 0xd800 && last <= 0xdbff && t.shown < t.target.length) t.shown++;
  render(page, t.id, t.target.slice(0, t.shown));
  if (t.shown < t.target.length) t.timer = setTimeout(() => type(page), TYPE_MS) as unknown as number;
}

// Only the reply being written changes; the rest of the conversation stays.
function render(page: Page, id: string, text: string) {
  page.partials = { ...page.partials, [id]: text };
  const job = page.history.find((j) => j.id === id);
  const at = page.data.messages.findIndex((m) => m.id === id + "a");
  const update: Record<string, unknown> = { replying: true };
  if (job && at >= 0 && page.data.messages[at].pending) update["messages[" + at + "]"] = streaming(job, text);
  else update.messages = chatMessages(page.history, page.partials);
  // Keep the newest words in view unless the reader scrolled up (not on
  // every tick: each scroll animates).
  const t = page.typer!;
  if (page.follow && Date.now() - t.scrolled > 300) {
    t.scrolled = Date.now();
    update.bottom = page.data.bottom === "end-a" ? "end-b" : "end-a";
  }
  page.setData(update);
}

function stopTyping(page: Page) {
  if (page.typer?.timer) clearTimeout(page.typer.timer);
  page.typer = undefined;
}

function ended(page: Page, id: string) {
  const t = page.typer;
  if (t?.id === id && t.shown < t.target.length) render(page, id, t.target); // the rest at once
  stopTyping(page);
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
    if (this.streamId) this.stopStream(); // another reply's stream and typing end first
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
    stopTyping(this);
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
