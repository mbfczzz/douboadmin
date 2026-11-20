import type { Job } from "../../services/types";
import type { Labelled } from "./materials";

// 编辑: a sent question comes back into the input box (with its
// attachments); sending it asks again as a new turn that revises the old
// one, which then leaves the conversation the model sees.
type Page = {
  data: { materials: Labelled[]; busy: boolean };
  history: Job[];
  setData(data: Record<string, unknown>): void;
};

export const editHandlers = {
  editMessage(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const id = String(e.currentTarget.dataset.id || "").replace(/u$/, ""); // the user message id is job id + "u"
    const job = this.history.find((j) => j.id === id);
    if (!job) return;
    const assets = job.input.assets || [];
    const attached = this.data.materials.filter((m) => assets.includes(m.id));
    this.setData({ prompt: job.input.prompt, attached, editing: id, focus: true });
  },
  cancelEdit(this: Page) {
    this.setData({ editing: "", prompt: "", attached: [] });
  },
};
