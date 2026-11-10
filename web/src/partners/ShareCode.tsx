import { useState } from "react";
import Memberships from "./Memberships";
import CodeView from "./CodeCard";
import BoundOwner from "./BoundOwner";
import type { Scope } from "./types";
import "./share-code.css";

// Every scan only registers; the platform (总部) opens the account.
const kinds = {
  member: ["会员开通码", "用户扫码登记为会员，总部开通后生效"],
  s1: ["S1 邀请码", "新用户扫码登记为 S1 服务商，总部开通后生效"],
  s2: ["S2 邀请码", "新用户扫码登记为 S2 推荐官，总部开通后生效"],
  bind: [
    "服务商绑定码",
    "负责人在小程序扫码绑定自己的账号，总部开通后生效；一次有效",
  ],
} as const;
type Kind = keyof typeof kinds;

// A provider's QR codes by role: every provider has the 会员开通码; a 分公司
// invites S1 and S2, an S1 invites S2. Admin-made providers also get a
// one-time bind code that links the owner's own mini-program account.
export default function ShareCode({ id, view, changed, notify }: Scope) {
  const { role, ownerUser, name } = view.record.data,
    has: Record<Kind, boolean> = {
      member: true,
      s1: role === "branch",
      s2: role === "branch" || role === "s1",
      // Invite-made providers are already their scanner's.
      bind: !ownerUser,
    },
    shown = (Object.keys(kinds) as Kind[]).filter((k) => has[k]),
    [picked, setKind] = useState<Kind>(shown[0]),
    kind = shown.includes(picked) ? picked : shown[0],
    path = `/admin/partners/${encodeURIComponent(id)}/codes/${kind}`,
    [title, note] = kinds[kind];
  return (
    <>
      <section className="share-panel" aria-label="分享码">
        {shown.length > 1 && (
          <div className="tabs share-tabs" role="tablist" aria-label="码类型">
            {shown.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
              >
                {kinds[k][0]}
              </button>
            ))}
          </div>
        )}
        <div
          className="share-body"
          role={shown.length > 1 ? "tabpanel" : undefined}
        >
          <CodeView
            key={kind}
            path={path}
            title={title}
            note={note}
            file={`${name}-${title}.png`}
            notify={notify}
            bound={(user, pending, reload) => (
              <BoundOwner
                path={path}
                user={user}
                pending={pending}
                reload={reload}
                notify={notify}
              />
            )}
          />
        </div>
      </section>
      <Memberships id={id} notify={notify} changed={changed} />
    </>
  );
}
