import { configured, sourceLabel } from "./meta";
import type { IntegrationGroup } from "./types";
import "./overview.css";

// Status pill per integration; clicking opens and scrolls to its form.
export default function Overview({
  groups,
  capabilities,
}: {
  groups: IntegrationGroup[];
  capabilities?: Record<string, boolean>;
}) {
  const ready = groups.filter((g) => configured(g, capabilities)).length;
  function open(id: string) {
    const target = document.getElementById(
      "integration-" + id,
    ) as HTMLDetailsElement | null;
    if (!target) return;
    target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <section className="integration-overview" aria-label="接入概览">
      <header>
        <div>
          <h2>接入概览</h2>
          <p className="quiet">
            点击服务名称直接进入对应配置。数据库、Redis
            和监听端口由服务器启动配置管理。
          </p>
        </div>
        <span className="integration-score">
          <b>{ready}</b> / {groups.length} 已配置
        </span>
        <span className="integration-bar" aria-hidden="true">
          <i
            style={{ width: `${(ready / Math.max(1, groups.length)) * 100}%` }}
          />
        </span>
      </header>
      <div className="integration-pills">
        {groups.map((g) => {
          const ok = configured(g, capabilities),
            state = g.pendingRestart ? "pending" : ok ? "ready" : "idle";
          return (
            <button
              key={g.id}
              type="button"
              className={"integration-pill " + state}
              title={`${g.name}：${g.pendingRestart ? "已保存，待重启" : ok ? "已配置" : "未配置"} · ${sourceLabel(g)}`}
              onClick={() => open(g.id)}
            >
              <i aria-hidden="true" />
              {g.name}
              <span className="visually-hidden">
                {g.pendingRestart ? "待重启" : ok ? "已配置" : "未配置"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
