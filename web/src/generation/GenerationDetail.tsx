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
  const cause = g?.execution?.errorCause,
    // A pending task whose last step failed (saving the result, polling).
    retrying = !done && !!g?.execution?.note?.includes("失败");
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
            {retrying && !j.error && (
              <section className="gen-warn" aria-label="正在重试">
                <h4>仍在自动重试</h4>
                <p>{g.execution?.note}</p>
                <p className="quiet">
                  约每分钟重试一次；从开始执行算起超过一小时仍未成功，任务会标记为失败，需要管理员核实后处理。
                </p>
              </section>
            )}
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
                </Field>
              )}
              {g.execution?.note && (
                <Field label="最近状态">
                  <span className={retrying ? "danger-text" : undefined}>
                    {g.execution.note}
                  </span>
                </Field>
              )}
              <Field label="用户">
                <IdChip>{j.userId}</IdChip>
              </Field>
              <Field label="调度轮次">
                {j.attempts} 次
                <small className="quiet gen-hint">
                  每次查询上游进度或重试都会计一次，不是重复生成
                </small>
              </Field>
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
