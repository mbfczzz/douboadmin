import Badge from "../components/Badge";
import type { ToolCheck } from "./types";
import "./tools.css";

export default function ToolStatus({
  name,
  tool,
  checkedAt,
  online,
  compact = false,
}: {
  name: string;
  tool?: ToolCheck;
  checkedAt?: string;
  online: boolean;
  compact?: boolean;
}) {
  const age = Date.now() - Date.parse(checkedAt || "");
  const fresh = Number.isFinite(age) && age >= -5000 && age < 120000;
  const state = !online
    ? ["muted", "节点离线"]
    : !tool || !Number.isFinite(age)
      ? ["muted", "未检测"]
      : !fresh
        ? ["queued", "结果已过期"]
        : tool.status === "ready" && tool.version
          ? ["succeeded", "可用"]
          : tool.status === "missing"
            ? ["queued", "未找到"]
            : tool.status === "timeout"
              ? ["failed", "检测超时"]
              : tool.status === "failed"
                ? ["failed", "执行异常"]
                : ["muted", "未检测"];
  const detail = online && fresh ? tool : undefined;
  if (compact)
    return (
      <span title={detail?.error || detail?.version}>
        <Badge state={state[0]} label={`${name} ${state[1]}`} />
      </span>
    );
  return (
    <div className="tool-check">
      <Badge state={state[0]} label={state[1]} />
      {detail?.version && <span>版本 {detail.version}</span>}
      {detail?.path && <small className="mono quiet">{detail.path}</small>}
      {detail?.error && <small>{detail.error}</small>}
      {!online && (
        <small className="quiet">节点恢复在线后才能确认当前状态。</small>
      )}
      {online && !tool && (
        <small className="quiet">升级并重启该节点后上报检测结果。</small>
      )}
      {online && tool && !fresh && (
        <small className="quiet">
          等待该节点重新上报，或重新检测当前 API。
        </small>
      )}
    </div>
  );
}
