import { useState } from "react";
import { api, type Job } from "../api";
import { ask } from "../confirm/ask";
import Modal from "./Modal";
import JobExecution, { useExecution } from "./JobExecution";

const resumePhases = ["polling", "output", "succeeded"];
// Any failed job may resume an existing upstream task (the dialog checks the
// phase); only jobs still holding points can have them released.
export const resumable = (job: Job) => job.status === "failed";
export const releasable = (job: Job) =>
  job.status === "failed" && job.billingState === "reserved";

// 恢复查询: only continues polling/saving an upstream task that exists; it
// never submits the generation again.
export function JobResume({
  job,
  onClose,
  onDone,
}: {
  job: Job;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const execution = useExecution(job.id),
    phase = execution.data?.phase || "",
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function resume() {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/jobs/${job.id}/resume`, {
        method: "POST",
        confirmation: { title: "确认恢复查询" },
      });
      onDone("已恢复查询与保存，不会重新提交生成");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title="恢复查询"
      subtitle={job.id}
      onClose={() => !busy && onClose()}
    >
      <div className="edit-form">
        <div className="form-body">
          <JobExecution execution={execution} />
          {execution.data && !resumePhases.includes(phase) && (
            <p className="quiet">
              上游没有可安全恢复的任务，无需恢复。
              {releasable(job) &&
                "请先在中转站核实提交情况，确认未生成后可使用“退回积分”。"}
            </p>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={busy || !resumePhases.includes(phase)}
            onClick={() => void resume()}
          >
            {busy ? "正在恢复…" : "恢复查询 / 保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

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
