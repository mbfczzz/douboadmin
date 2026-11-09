import { api, type Job } from "../api";
import { ask } from "../confirm/ask";

// Only jobs still holding points can have them released.
export const releasable = (job: Job) =>
  job.status === "failed" && job.billingState === "reserved";

// 退回积分: after checking upstream delivered nothing, release the hold.
export async function releaseJob(job: Job) {
  const reason = await ask({
    title: "核实后退回积分",
    message:
      "请先在中转站核实该上游任务没有向用户交付结果。退回后此任务不会再扣费或恢复生成。",
    confirmText: "退回积分",
    danger: true,
    reason: {
      label: "处理原因",
      placeholder: "例如：已核实上游未出图",
      minLength: 5,
    },
    run: (reason) =>
      api(`/admin/jobs/${job.id}/release`, {
        method: "POST",
        body: JSON.stringify({ verified: true, reason }),
        confirmation: {
          title: "确认退回积分",
          labels: { verified: "已核实上游未交付", reason: "处理原因" },
        },
      }),
  });
  return reason !== false;
}
