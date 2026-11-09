import { Bot, Globe, LogIn, MousePointerClick } from "lucide-react";
import { failed, type LogEntry } from "../logs/types";

const kinds: Record<string, [typeof Bot, string]> = {
  auth: [LogIn, "登录"],
  business: [MousePointerClick, "操作"],
  api: [Globe, "接口请求"],
  model: [Bot, "模型调用"],
};

// "2026-11-09 17:23:39" in Beijing time.
const local = (s: string) =>
  new Date(s).toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

function dayLabel(day: string) {
  const today = local(new Date().toISOString()).slice(0, 10),
    yesterday = local(new Date(Date.now() - 864e5).toISOString()).slice(0, 10);
  return day === today
    ? `今天 · ${day}`
    : day === yesterday
      ? `昨天 · ${day}`
      : day;
}

// A user's actions grouped by day, newest first; failures stand out.
export default function ActivityTimeline({
  items,
  onOpen,
}: {
  items: LogEntry[];
  onOpen: (e: LogEntry) => void;
}) {
  const days: [string, LogEntry[]][] = [];
  for (const e of items) {
    const day = local(e.at).slice(0, 10);
    if (days.at(-1)?.[0] !== day) days.push([day, []]);
    days.at(-1)![1].push(e);
  }
  return (
    <div className="timeline">
      {days.map(([day, entries]) => (
        <section key={day} aria-label={day}>
          <h4 className="timeline-day">{dayLabel(day)}</h4>
          <ol>
            {entries.map((e) => {
              const [Icon, kind] = kinds[e.category] || kinds.api,
                bad = failed(e);
              return (
                <li key={e.id} className={bad ? "failed" : undefined}>
                  <time className="quiet">{local(e.at).slice(11)}</time>
                  <span className={"timeline-icon " + e.category} title={kind}>
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <div className="timeline-body">
                    <div className="timeline-title">
                      <b>{e.action || e.route || "接口请求"}</b>
                      {bad && (
                        <span className="timeline-fail">
                          失败{e.status ? ` · ${e.status}` : ""}
                        </span>
                      )}
                    </div>
                    {e.summary && <p>{e.summary}</p>}
                    {e.error && <p className="timeline-error">{e.error}</p>}
                    <p className="timeline-meta quiet">
                      <span className="timeline-clock">
                        {local(e.at).slice(11)}
                      </span>
                      <span className="mono">
                        {e.method} {e.path}
                      </span>
                      {e.ip && <span>{e.ip}</span>}
                      <span>{e.durationMs} ms</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpen(e)}
                  >
                    详情
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
