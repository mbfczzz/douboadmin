import { error, hasSession } from "../../utils/api";
import { readView, writeView } from "../../utils/view-cache";
import { chatMessages } from "../../utils/chat";
import type { ChatMessage } from "../../utils/chat";
import { jobPage } from "../../services/job-pages";
import { sessionToken } from "../../services/session";
import type { Job } from "../../services/types";
import type { SessionDetail } from "../../services/agent";

// The open project's conversation: its chat turns and generations, newest
// page first, polled while anything is still running.
type Page = {
  data: { messages: ChatMessage[]; session: SessionDetail | null; ready: boolean; hasOlder: boolean; loadingOlder: boolean };
  timer: number;
  fetching: boolean;
  failed: boolean;
  loadVersion: number;
  destroyed: boolean;
  historyPage: number;
  history: Job[];
  historyKey: string;
  setData(data: Record<string, unknown>): void;
  priceLatest?(): Promise<void>;
  autoTitle?(): Promise<void>;
};
const filter = (page: Page) => "&session=" + page.data.session!.id;
const running = (jobs: Job[]) => jobs.some((j) => /queued|running/.test(j.status));

export const historyHandlers = {
  // Poll only while a reply or generation may still arrive.
  poll(this: Page & { load(): Promise<void> }) {
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.load(), 3000);
  },
  async load(this: Page, force = false) {
    const session = this.data.session;
    const key = sessionToken() + ":" + (session?.id || "");
    if (key !== this.historyKey) {
      this.historyKey = key;
      this.history = [];
      this.historyPage = 1;
      // Until history arrives, show this project's last conversation.
      const seen = session ? readView<ChatMessage[]>("agent:" + session.id, 24 * 60 * 60 * 1000) : undefined;
      this.setData({ messages: seen || [], hasOlder: false, ready: !!seen, bottom: seen?.length ? "m" + seen[seen.length - 1].id : "" });
    }
    if (!hasSession() || !session) {
      clearInterval(this.timer); // nothing to wait for without a project
      this.loadVersion++;
      this.fetching = false;
      this.setData({ messages: [], ready: true });
      return;
    }
    if (this.fetching && !force) return;
    const version = ++this.loadVersion;
    this.fetching = true;
    try {
      const result = await jobPage(1, filter(this));
      if (version !== this.loadVersion) return;
      const fresh = result.items;
      const jobs = [...fresh, ...this.history.filter((j) => !fresh.some((n) => n.id === j.id))];
      this.failed = false;
      this.history = jobs;
      this.setData({ hasOlder: jobs.length < result.total });
      if (!running(jobs)) clearInterval(this.timer);
      const messages = chatMessages(jobs);
      const changed = JSON.stringify(messages) !== JSON.stringify(this.data.messages);
      if (changed) this.setData({ messages, bottom: messages.length ? "m" + messages[messages.length - 1].id : "" });
      if (changed) void this.priceLatest?.();
      if (changed) void this.autoTitle?.();
      if (!this.data.ready) this.setData({ ready: true });
      // Replies still being written are not cached.
      if (changed) writeView("agent:" + session.id, messages.filter((m) => !m.pending).slice(-30));
    } catch (e) {
      if (version !== this.loadVersion) return;
      if (!this.failed) error(e); // one toast per outage
      this.failed = true;
      if (!this.data.ready) this.setData({ ready: true });
    } finally {
      if (version === this.loadVersion) this.fetching = false;
    }
  },
  async older(this: Page) {
    if (this.data.loadingOlder || !this.data.hasOlder || !this.data.session) return;
    const version = this.loadVersion;
    this.setData({ loadingOlder: true });
    try {
      const result = await jobPage(this.historyPage + 1, filter(this));
      if (version !== this.loadVersion) return;
      this.historyPage++;
      this.history = [...this.history, ...result.items.filter((j) => !this.history.some((old) => old.id === j.id))];
      this.setData({ messages: chatMessages(this.history), hasOlder: this.history.length < result.total });
    } catch (e) {
      if (version === this.loadVersion) error(e);
    } finally {
      if (version === this.loadVersion && !this.destroyed) this.setData({ loadingOlder: false });
    }
  },
};
