import { useEffect, useState } from "react";
import { date } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import RequestState from "../components/RequestState";
import Tag, { IdChip } from "../components/Tag";
import DetailCard, { Field } from "../components/DetailCard";
import { kindNames, points } from "../business/types";
import Inputs from "./Inputs";
import Calls from "./Calls";
import Result from "./Result";
import {
  billingNames,
  elapsed,
  modeNames,
  paramLabels,
  phaseNames,
  pointsLabel,
  type Generation,
} from "./types";
import "../logs/logs.css";
import "./generation.css";

// Everything about one generation: what the user sent (prompt, images,
// reference video and audio, parameters), what came back, any error, and the
// raw upstream request/response. Works for image, video, audio and text.
export default function GenerationDetail({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  // Refresh while the task runs, like the task list does.
  const [live, setLive] = useState(true),
    res = useResource<Generation>(path, live ? 15000 : 0),
    g = res.data,
    j = g?.job,
    done = j && (j.status === "succeeded" || j.status === "failed");
  const params: [string, string][] = j
    ? [
        ["模型", j.modelName || j.input.model],
        ...paramLabels
          .map(([key, label]): [string, string] => {
            const v = j.input[key];
            if (v === undefined || v === null || v === "" || v === 0)
              return [label, ""];
            if (key === "duration") return [label, `${v} 秒`];
            if (key === "mode")
              return [
                label,
                modeNames[String(v)]
                  ? `${modeNames[String(v)]}（${v}）`
                  : String(v),
              ];
            return [label, String(v)];
          })
          .filter(([, v]) => v),
        [
          pointsLabel[j.billingState || ""] || "消耗积分",
          points(j.costUnits || 0),
        ],
        [
          "计费状态",
          billingNames[j.billingState || ""] || j.billingState || "—",
        ],
        ["耗时", done ? elapsed(j.createdAt, j.updatedAt) : "进行中"],
      ]
    : [];
  const cause = g?.execution?.errorCause;
  useEffect(() => {
    if (done) setLive(false);
  }, [done]);
  return (
    <Modal
      title="生成记录详情"
      subtitle={j ? date(j.createdAt, true) : undefined}
      onClose={onClose}
      style={{ width: "min(900px, 100%)" }}
    >
      <div className="edit-form gen-detail">
        <RequestState
          loading={res.loading && !g}
          error={res.error}
          retry={res.reload}
        />
        {g && j && (
          <>
            <div className="detail-tags">
              <Badge state={j.status} />
              <Tag tone="info">{kindNames[j.input.kind] || j.input.kind}</Tag>
              <Tag tone="accent">{j.modelName || j.input.model}</Tag>
            </div>
            {(j.error || cause) && (
              <section className="gen-error" aria-label="失败原因">
                <h4>失败原因</h4>
                {j.error && <p>{j.error}</p>}
                {cause && cause !== j.error && (
                  <p className="quiet">上游返回：{cause}</p>
                )}
              </section>
            )}
            <section aria-label="生成结果">
              <h4>生成结果</h4>
              <Result job={j} />
            </section>
            <section aria-label="提示词">
              <h4>提示词</h4>
              <p className="gen-prompt">
                {j.input.prompt || "（未填写提示词）"}
              </p>
            </section>
            <section aria-label="输入素材">
              <h4>输入素材 {g.inputs.length} 个</h4>
              <Inputs inputs={g.inputs} />
            </section>
            <section aria-label="生成参数">
              <h4>生成参数</h4>
              <dl className="gen-params">
                {params.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section aria-label="模型调用">
              <h4>模型调用（请求与响应）</h4>
              <Calls calls={g.calls} polls={g.polls} more={g.morePolls} />
            </section>
            <DetailCard title="技术信息">
              <Field label="任务编号">
                <IdChip>{j.id}</IdChip>
              </Field>
              <Field label="上游任务号">
                {g.execution?.taskId ? (
                  <IdChip>{g.execution.taskId}</IdChip>
                ) : (
                  "未返回"
                )}
              </Field>
              {g.execution?.modelKey && (
                <Field label="上游模型">
                  <span className="mono">{g.execution.modelKey}</span>
                </Field>
              )}
              {g.execution && (
                <Field label="执行阶段">
                  {phaseNames[g.execution.phase] || g.execution.phase}
                  {g.execution.note ? ` · ${g.execution.note}` : ""}
                </Field>
              )}
              <Field label="用户">
                <IdChip>{j.userId}</IdChip>
              </Field>
              <Field label="处理次数">{j.attempts}</Field>
              <Field label="提交时间">{date(j.createdAt, true)}</Field>
              {j.updatedAt && (
                <Field label="更新时间">{date(j.updatedAt, true)}</Field>
              )}
            </DetailCard>
            <p className="quiet log-note">
              密钥等敏感字段已隐藏，内联图片等超长内容已截断；素材链接为临时地址。
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
