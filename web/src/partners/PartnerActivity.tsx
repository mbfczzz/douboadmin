import { useMe } from "../session";
import { useState } from "react";
import { useActivity } from "../users/useActivity";
import ActivityTimeline from "../users/ActivityTimeline";
import type { LogEntry } from "../logs/types";
import RequestState from "../components/RequestState";
import Empty from "../components/Empty";
import Modal from "../components/Modal";
import { date } from "../api";
import "../users/timeline.css";

export default function PartnerActivity({ id }: { id: string }) {
  const own = useMe()?.partnerId === id;
  const log = useActivity(
    `/admin/partners/${encodeURIComponent(id)}/activity`,
    "ops",
  );
  const [entry, setEntry] = useState<LogEntry>();
  return (
    <>
      <p className="quiet">
        {own
          ? "查看下级会员的操作轨迹。"
          : "查看该下级登录账号及其会员的操作轨迹。"}
      </p>
      <ActivityTimeline showActor items={log.items} onOpen={setEntry} />
      {!log.loading && !log.error && !log.items.length && (
        <Empty text="暂无活动记录" />
      )}
      <RequestState
        loading={log.loading && !log.items.length}
        error={log.error}
        retry={log.reload}
      />
      {log.next && (
        <button
          className="secondary"
          disabled={log.loading}
          onClick={() => void log.more()}
        >
          {log.loading ? "加载中…" : "加载更多"}
        </button>
      )}
      {entry && (
        <Modal title="活动详情" onClose={() => setEntry(undefined)}>
          <div className="edit-form">
            <p>
              {entry.actorName || "用户"} · {date(entry.at, true)}
            </p>
            <p>{entry.action || "业务操作"}</p>
            <p>{entry.summary || "无补充说明"}</p>
            <p className="quiet">
              {entry.status >= 400 ? "操作未完成" : "操作成功"}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
