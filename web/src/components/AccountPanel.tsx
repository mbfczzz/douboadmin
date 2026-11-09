import { useEffect, useState } from "react";
import {
  Building2,
  Clock,
  KeyRound,
  LayoutGrid,
  LogOut,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import type { Me } from "../session";
import { device } from "./device";
import "./account-panel.css";

type Login = { at: string; ip: string; userAgent: string; ok: boolean };

// Whole days since a timestamp; undefined for Go's zero time ("never").
const daysSince = (s?: string) => {
  const t = s ? Date.parse(s) : NaN;
  return t > Date.UTC(2000, 0)
    ? Math.floor((Date.now() - t) / 864e5)
    : undefined;
};
// "今天 11:21" / "昨天 …" / "明天 …", else "11-08 11:21" (Beijing time).
const local = (t: number) =>
  new Date(t).toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
function when(s?: string) {
  const t = s ? Date.parse(s) : NaN;
  if (!(t > Date.UTC(2000, 0))) return "—";
  const [day, time] = local(t).split(" "),
    words: Record<string, string> = {
      [local(Date.now()).slice(0, 10)]: "今天",
      [local(Date.now() - 864e5).slice(0, 10)]: "昨天",
      [local(Date.now() + 864e5).slice(0, 10)]: "明天",
    };
  return `${words[day] || day.slice(5)} ${time.slice(0, 5)}`;
}

// Contents of the account popover: identity card, account facts, recent
// sign-ins (failures included) and the account's own actions.
export default function AccountPanel({
  me,
  name,
  onPassword,
  onLogs,
  onLogout,
}: {
  me: Me;
  name: string;
  onPassword: () => void;
  onLogs?: () => void;
  onLogout: () => void;
}) {
  const [logins, setLogins] = useState<Login[] | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    api<Login[]>("/admin/me/logins", { signal: c.signal }).then(
      setLogins,
      () => {
        if (!c.signal.aborted) setFailed(true);
      },
    );
    return () => c.abort();
  }, []);
  const age = daysSince(me.passwordChangedAt),
    account = me.account || me.id,
    role = me.roleName || (me.role === "super_admin" ? "超级管理员" : "管理员"),
    facts: [typeof Clock, string, string][] = [
      [Building2, "所属", me.partnerName || "平台"],
      [LayoutGrid, "可见菜单", `${me.menus.length} 个`],
      [
        KeyRound,
        "密码更新",
        age === undefined ? "—" : age ? `${age} 天前` : "今天",
      ],
      [Clock, "会话到期", when(me.sessionExpires)],
    ];
  return (
    <>
      <div className="account-card">
        <span className="avatar account-avatar" aria-hidden="true">
          {name[0]}
        </span>
        <div>
          <b>{name}</b>
          <span className="account-sub">
            <span className="account-role">{role}</span>
            {name !== account && <span className="mono">{account}</span>}
          </span>
          {me.phone && <small className="quiet">{me.phone}</small>}
        </div>
      </div>
      <dl className="account-facts">
        {facts.map(([Icon, k, v]) => (
          <div key={k}>
            <dt>
              <Icon size={12} aria-hidden="true" />
              {k}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {age !== undefined && age >= 90 && (
        <p className="account-warn">
          <ShieldAlert size={14} aria-hidden="true" />
          密码已超过 90 天未修改，建议更新
        </p>
      )}
      <section className="account-logins" aria-label="最近登录">
        <h4>
          最近登录<span className="quiet">近 5 次</span>
        </h4>
        {failed ? (
          <p className="account-empty quiet">登录记录暂时无法读取</p>
        ) : !logins ? (
          <p className="account-empty quiet">正在读取…</p>
        ) : !logins.length ? (
          <p className="account-empty">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              还没有登录记录
              <small className="quiet">
                之后每次登录（包括失败）都会显示在这里
              </small>
            </span>
          </p>
        ) : (
          <ul>
            {logins.map((l) => (
              <li key={l.at} className={l.ok ? "ok" : "failed"}>
                <i aria-hidden="true" />
                <span>{when(l.at)}</span>
                <span className="quiet">
                  {l.ok ? device(l.userAgent) : "密码错误"}
                </span>
                <span className="mono quiet">{l.ip || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="account-actions">
        <button type="button" onClick={onPassword}>
          <KeyRound size={15} />
          修改密码
        </button>
        {onLogs && (
          <button type="button" onClick={onLogs}>
            <ScrollText size={15} />
            我的操作日志
          </button>
        )}
      </div>
      <div className="account-actions account-exit">
        <button type="button" className="danger-text" onClick={onLogout}>
          <LogOut size={15} />
          退出登录
        </button>
      </div>
    </>
  );
}
