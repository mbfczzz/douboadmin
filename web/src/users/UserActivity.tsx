import { useState } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import Empty from "../components/Empty";
import LogDetail from "../logs/LogDetail";
import type { LogEntry } from "../logs/types";
import type { Profile } from "../business/types";
import RecordsHead from "./RecordsHead";
import ActivityTimeline from "./ActivityTimeline";
import { useActivity } from "./useActivity";
import "../logs/logs.css";
import "./records.css";
import "./timeline.css";

const scopes = [
  ["ops", "操作记录", "登录、开通、生成、充值、资料修改等有业务含义的操作"],
  ["all", "全部请求", "另含浏览类请求和为该用户执行的模型调用"],
] as const;
type Scope = (typeof scopes)[number][0];

// What one user did, from the operation log, as a timeline.
export default function UserActivity({
  user,
  onClose,
}: {
  user: Row<Profile>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("ops"),
    [open, setOpen] = useState<LogEntry>(),
    base = `/admin/users/${encodeURIComponent(user.id)}/activity`,
    log = useActivity(base, scope);
  return (
    <Modal
      title="行为日志"
      onClose={onClose}
      style={{ width: "min(880px, 100%)" }}
    >
      <div className="edit-form user-records">
        <RecordsHead user={user} />
        <div className="records-toolbar">
          <div className="records-scopes" role="tablist" aria-label="记录范围">
            {scopes.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={scope === id}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="quiet">
            {scopes.find(([id]) => id === scope)?.[2]}
          </span>
        </div>
        {!log.items.length && !log.loading && !log.error && (
          <Empty text="暂无记录" help="该用户在日志保留期内没有对应的记录。" />
        )}
        <ActivityTimeline items={log.items} onOpen={setOpen} />
        <RequestState
          loading={log.loading && !log.items.length}
          error={log.error}
          retry={log.reload}
        />
        {log.next && (
          <button
            type="button"
            className="secondary records-more"
            disabled={log.loading}
            onClick={() => void log.more()}
          >
            {log.loading ? "正在加载…" : "加载更多"}
          </button>
        )}
      </div>
      {open && (
        <LogDetail
          entry={open}
          path={`${base}/${open.id}`}
          onClose={() => setOpen(undefined)}
        />
      )}
    </Modal>
  );
}
