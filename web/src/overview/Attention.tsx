import { AlertTriangle, ArrowUpRight } from "lucide-react";
import type { Dashboard } from "../business/types";
import type { Config } from "../api";
import type { PageId } from "../navigation";

// Things that need someone, at the very top; nothing at all when all is well.
export default function Attention({
  data,
  config,
  navigate,
}: {
  data?: Dashboard;
  config?: Config;
  navigate: (page: PageId) => void;
}) {
  const failed = (data?.days || []).reduce((a, d) => a + d.failed, 0),
    unknownCost = (data?.models || []).reduce(
      (a, m) => a + Math.max(0, m.calls - m.known),
      0,
    );
  const items = [
    failed
      ? {
          label: `${failed} 个生成任务失败`,
          help: "查看失败原因并处理",
          page: "jobs" as const,
        }
      : undefined,
    unknownCost
      ? {
          label: `${unknownCost} 次 AI 调用成本未知`,
          help: "补全模型成本配置",
          page: "models" as const,
        }
      : undefined,
    config && !config.relayConfigured
      ? {
          label: "AI 中转服务尚未配置",
          help: "配置后才能开放生成",
          page: "settings" as const,
        }
      : undefined,
  ].filter((item) => item !== undefined);
  if (!items.length) return null;
  return (
    <section
      className="panel attention-panel overview-alerts"
      aria-label="需要处理"
    >
      <span className="overview-alerts-title">
        <AlertTriangle size={16} aria-hidden="true" />
        需要处理
        <small>{items.length} 项</small>
      </span>
      <div className="overview-alerts-items">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.page)}
          >
            <b>{item.label}</b>
            <small>{item.help}</small>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
