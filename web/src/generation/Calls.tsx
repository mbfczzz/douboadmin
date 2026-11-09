import { date } from "../api";
import Badge from "../components/Badge";
import Tag from "../components/Tag";
import { failed, pretty, type LogEntry } from "../logs/types";

function Body({ title, text }: { title: string; text?: string }) {
  return (
    <section className="log-body" aria-label={title}>
      <h4>{title}</h4>
      <pre>{text ? pretty(text) : "（无内容）"}</pre>
    </section>
  );
}

// Raw upstream calls: submissions, failures and the latest call (usually the
// final answer) open by default.
export default function Calls({
  calls,
  polls,
  more,
}: {
  calls: LogEntry[];
  polls: number;
  more: boolean;
}) {
  if (!calls.length)
    return (
      <p className="quiet">
        没有该任务的模型调用记录（任务尚未提交，或记录已超过保留期限）。
      </p>
    );
  return (
    <div className="gen-calls">
      {calls.map((c, i) => (
        <details
          key={c.id}
          open={c.method !== "GET" || failed(c) || i === calls.length - 1}
        >
          <summary>
            <b>{c.action || "调用上游接口"}</b>
            <Badge
              state={failed(c) ? "failed" : "succeeded"}
              label={c.status ? String(c.status) : failed(c) ? "失败" : "成功"}
            />
            <Tag tone={c.durationMs > 1000 ? "warning" : "muted"}>
              {c.durationMs} ms
            </Tag>
            <span className="quiet">{date(c.at, true)}</span>
          </summary>
          <p className="mono gen-endpoint">
            {c.method} {c.path}
          </p>
          {c.error && <p className="error">{c.error}</p>}
          {/* Status queries carry no body; the URL above is the request. */}
          {c.request && <Body title="请求参数" text={c.request} />}
          <Body title="返回结果" text={c.response} />
        </details>
      ))}
      {polls > 1 && (
        <p className="quiet">
          共查询生成结果 {more ? "100 次以上" : polls + " 次"}
          ；这里保留首次提交、失败的查询和最近一次查询的完整报文。
        </p>
      )}
    </div>
  );
}
