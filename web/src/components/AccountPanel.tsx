import { useEffect, useState } from "react";
import { KeyRound, LogOut, ScrollText, ShieldAlert } from "lucide-react";
import { api, date } from "../api";
import type { Me } from "../session";
import { device } from "./device";

type Login = { at: string; ip: string; userAgent: string; ok: boolean };

// Whole days since a timestamp; undefined for Go's zero time ("never").
const daysSince = (s?: string) => {
  const t = s ? Date.parse(s) : NaN;
  return t > Date.UTC(2000, 0)
    ? Math.floor((Date.now() - t) / 864e5)
    : undefined;
};

// Contents of the account popover: identity, account facts, recent sign-ins
// (failures included) and the account's own actions.
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
    role = me.roleName || (me.role === "super_admin" ? "超级管理员" : "管理员"),
    facts: [string, string][] = [
      ["所属", me.partnerName ? "服务商 · " + me.partnerName : "平台"],
      ...(me.phone ? ([["手机号", me.phone]] as [string, string][]) : []),
      ["可见菜单", `${me.menus.length} 个`],
      ["密码更新", age === undefined ? "—" : age ? `${age} 天前` : "今天"],
      ["会话有效至", date(me.sessionExpires)],
    ];
  return (
    <>
      <div className="account-who">
        <span className="avatar large" aria-hidden="true">
          {name[0]}
        </span>
        <div>
          <b>{name}</b>
          <span className="account-sub">
            <span className="account-role">{role}</span>
            {name !== (me.account || me.id) && (
              <span className="mono">{me.account || me.id}</span>
            )}
          </span>
        </div>
      </div>
      <dl className="account-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
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
        <h4>最近登录</h4>
        {failed ? (
          <p className="quiet">登录记录暂时无法读取</p>
        ) : !logins ? (
          <p className="quiet">正在读取…</p>
        ) : !logins.length ? (
          <p className="quiet">暂无登录记录</p>
        ) : (
          <ul>
            {logins.map((l) => (
              <li key={l.at} className={l.ok ? "" : "failed"}>
                <span>{date(l.at)}</span>
                <span className="mono">{l.ip || "—"}</span>
                <small>{l.ok ? device(l.userAgent) : "登录失败"}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="account-actions">
        <button type="button" role="menuitem" onClick={onPassword}>
          <KeyRound size={15} />
          修改密码
        </button>
        {onLogs && (
          <button type="button" role="menuitem" onClick={onLogs}>
            <ScrollText size={15} />
            我的操作日志
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="danger-text"
          onClick={onLogout}
        >
          <LogOut size={15} />
          退出登录
        </button>
      </div>
    </>
  );
}
