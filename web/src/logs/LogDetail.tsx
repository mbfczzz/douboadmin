import { date } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import Badge from "../components/Badge";
import Tag, { IdChip } from "../components/Tag";
import DetailCard, { Field } from "../components/DetailCard";
import {
  actorLabels,
  failed,
  methodTones,
  pretty,
  targetLabels,
  type LogEntry,
} from "./types";

function Body({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <section className="log-body" aria-label={title}>
      <h4>{title}</h4>
      <pre>{pretty(text)}</pre>
    </section>
  );
}

// Full record of one log line, including the redacted request and response.
export default function LogDetail({
  entry,
  onClose,
}: {
  entry: LogEntry;
  onClose: () => void;
}) {
  const full = useResource<LogEntry>(`/admin/audit/${entry.id}`),
    e = full.data || entry,
    [who, tone] = actorLabels[e.actorType] || actorLabels.guest;
  return (
    <Modal
      title={e.action || e.route || "日志详情"}
      subtitle={date(e.at, true)}
      onClose={onClose}
      style={{ width: "min(860px, 100%)" }}
    >
      <div className="edit-form log-detail">
        <DetailCard title="概要">
          <Field label="结果">
            <Badge
              state={failed(e) ? "failed" : "succeeded"}
              label={failed(e) ? "失败" : "成功"}
            />{" "}
            {e.status > 0 && <Tag>HTTP {e.status}</Tag>}{" "}
            <Tag tone={e.durationMs > 1000 ? "warning" : "muted"}>
              {e.durationMs} ms
            </Tag>
          </Field>
          <Field label="操作人">
            <Tag tone={tone}>{who}</Tag> {e.actorName || "—"}{" "}
            {e.actorId && <IdChip>{e.actorId}</IdChip>}
          </Field>
          {e.targetId && (
            <Field label="操作对象">
              <Tag>{targetLabels[e.targetType || ""] || e.targetType}</Tag>{" "}
              {e.targetName} <IdChip>{e.targetId}</IdChip>
            </Field>
          )}
          {e.summary && <Field label="内容">{e.summary}</Field>}
          {e.error && (
            <Field label="错误">
              <span className="danger-text">{e.error}</span>
            </Field>
          )}
        </DetailCard>
        <DetailCard title="请求">
          <Field label="接口">
            <Tag tone={methodTones[e.method || ""] || "muted"}>{e.method}</Tag>{" "}
            <span className="mono log-path">{e.path}</span>
          </Field>
          {e.route && <Field label="路由">{e.route}</Field>}
          {e.ip && <Field label="IP">{e.ip}</Field>}
          {e.userAgent && <Field label="客户端">{e.userAgent}</Field>}
          <Field label="日志编号">
            <IdChip>{e.id}</IdChip>
          </Field>
        </DetailCard>
        <RequestState
          loading={full.loading && !full.data}
          error={full.error}
          retry={full.reload}
        />
        <Body title="请求参数" text={e.request} />
        <Body title="返回结果" text={e.response} />
        <p className="quiet log-note">
          密码、密钥、令牌等敏感字段已隐藏；超过 16 KB 的内容已截断。
        </p>
      </div>
    </Modal>
  );
}
