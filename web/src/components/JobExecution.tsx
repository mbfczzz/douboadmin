import { useResource } from "../hooks/useResource";
import Badge from "./Badge";
import { IdChip } from "./Tag";
import DetailCard, { Field } from "./DetailCard";

interface Execution {
  phase: string;
  taskId: string;
  modelKey: string;
  startedAt: string;
  note?: string;
  errorCause?: string;
}
const phases: Record<string, string> = {
  submitting: "提交中",
  uncertain: "提交结果待核实",
  polling: "查询上游结果",
  output: "保存生成结果",
  succeeded: "已保存",
  failed: "上游拒绝或生成失败",
};
const phaseTones: Record<string, string> = {
  succeeded: "succeeded",
  failed: "failed",
  uncertain: "failed",
  submitting: "queued",
};

export const useExecution = (id: string) =>
  useResource<Execution>(`/admin/jobs/${id}/execution`);

// Read-only upstream state; recovery actions live on the task row.
export default function JobExecution({
  execution,
}: {
  execution: ReturnType<typeof useExecution>;
}) {
  const data = execution.data;
  if (!data) return null;
  return (
    <div className="execution-detail">
      <DetailCard title="上游执行">
        <Field label="执行阶段">
          <Badge
            state={phaseTones[data.phase] || "running"}
            label={phases[data.phase] || data.phase}
          />
        </Field>
        <Field label="上游任务号">
          {data.taskId ? <IdChip>{data.taskId}</IdChip> : "未返回"}
        </Field>
        {data.note && <Field label="最近状态">{data.note}</Field>}
        {data.errorCause && (
          <Field label="上游错误">
            <span className="danger-text">{data.errorCause}</span>
          </Field>
        )}
      </DetailCard>
    </div>
  );
}
