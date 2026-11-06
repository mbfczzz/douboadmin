import { useState } from "react";
import { api, type Job } from "../api";
import { useResource } from "../hooks/useResource";
interface Execution {
  phase: string;
  taskId: string;
  modelKey: string;
  startedAt: string;
}
const phases: Record<string, string> = {
  submitting: "提交中",
  uncertain: "提交结果待核实",
  polling: "查询上游结果",
  output: "保存生成结果",
  succeeded: "已保存",
  failed: "上游拒绝或生成失败",
};

export default function JobExecution({ job }: { job: Job }) {
  const resource = useResource<Execution>(`/admin/jobs/${job.id}/execution`);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const data = resource.data;
  async function release() {
    const reason = window.prompt(
      "请先核实上游任务未向用户交付结果，再填写退回积分的处理原因：",
    );
    if (!reason) return;
    setBusy(true);
    try {
      await api(`/admin/jobs/${job.id}/release`, {
        method: "POST",
        body: JSON.stringify({ verified: true, reason }),
      });
      setMessage("预留积分已退回。此任务不会再次扣费或恢复生成。");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/admin/jobs/${job.id}/resume`, { method: "POST" });
      setMessage("已恢复查询与保存，不会重新提交生成。");
      void resource.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return null;
  return (
    <div className="execution-detail">
      <dl>
        <dt>执行阶段</dt>
        <dd>{phases[data.phase] || data.phase}</dd>
        <dt>上游任务号</dt>
        <dd className="mono">{data.taskId || "未返回"}</dd>
      </dl>
      <div className="business-filters">
        {job.status === "failed" &&
          ["polling", "output", "succeeded"].includes(data.phase) && (
            <button
              className="secondary"
              onClick={resume}
              disabled={busy || message.startsWith("已恢复")}
            >
              {busy ? "正在恢复…" : "恢复查询 / 保存"}
            </button>
          )}
        {job.status === "failed" && job.billingState === "reserved" && (
          <button
            className="secondary"
            disabled={busy || message.startsWith("预留积分已退回")}
            onClick={() => void release()}
          >
            核实后退回积分
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
