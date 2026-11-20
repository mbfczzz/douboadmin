import type { Job } from "../../services/types";
import { error } from "../../utils/api";
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
    // Its pictures and videos come back too, in the order it sent them.
    const attached = assets.map((a) => this.data.materials.find((m) => m.id === a)).filter((m): m is Labelled => !!m);
    this.setData({ prompt: job.input.prompt, attached, editing: id, focus: true });
    if (attached.length < assets.length) error(new Error(`有 ${assets.length - attached.length} 个附件已从项目移除，需要的话请重新上传`));
  },
  cancelEdit(this: Page) {
    this.setData({ editing: "", prompt: "", attached: [] });
  },
};
