import { useState } from "react";
import Memberships from "./Memberships";
import CodeUses from "./CodeUses";
import CodeView from "./CodeCard";
import OwnerBindCode from "./OwnerBindCode";
import { useShareCode } from "./useShareCode";
import { useMe, canManageAccounts } from "../session";
import { codeKindName } from "../business/types";
import type { Scope } from "./types";
import "./share-code.css";

// Every scan registers first; a super administrator opens the account.
const kinds = {
  s1: [
    codeKindName("s1"),
    "新用户扫码登记为本服务商下的 S1 服务商，超级管理员开通后生效",
  ],
  s2: [
    codeKindName("s2"),
    "新用户扫码登记为本服务商下的 S2 推荐官，超级管理员开通后生效",
  ],
  member: [
    codeKindName(""),
    "用户扫码登记为子账号（会员），直接归属本服务商，超级管理员开通后生效",
  ],
} as const;
type Kind = keyof typeof kinds;

// A provider's QR codes by role: every provider has the 子账号开通码; a 分公司
// invites S1 and S2, an S1 invites S2. Admin-made providers also get a
// one-time bind code that links the owner's own mini-program account.
export default function ShareCode({ id, view, changed, notify }: Scope) {
  const manage = canManageAccounts(useMe());
  const self = useMe()?.partnerId === id;
  const { role, ownerUser, name } = view.record.data,
    has: Record<Kind, boolean> = {
      member: true,
      s1: role === "branch",
      s2: role === "branch" || role === "s1",
    },
    shown = (Object.keys(kinds) as Kind[]).filter((k) => has[k]),
    [picked, setKind] = useState<Kind>(shown[0]),
    kind = shown.includes(picked) ? picked : shown[0],
    path = `/admin/partners/${encodeURIComponent(id)}/codes/${kind}`,
    [title, note] = kinds[kind];
  const share = useShareCode(path);
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
          aria-label={title}
        >
          <h3 className="share-title">{title}</h3>
          <p className="share-owner quiet">归属服务商：{name}</p>
          <CodeView
            key={id}
            owner={name}
            path={path}
            title={title}
            note={note}
            file={`${name}-${title}.png`}
            notify={notify}
            share={share}
          />
        </div>
      </section>
      {manage && !ownerUser && !self && (
        <OwnerBindCode
          id={id}
          name={name}
          reviewerId={view.record.data.parentId}
          notify={notify}
          changed={changed}
        />
      )}
      <CodeUses
        id={id}
        kind={kind}
        code={share.data?.code}
        reviewerId={id}
        notify={notify}
        changed={changed}
      />
      {kind === "member" && share.data?.code && (
        <Memberships
          key={share.data.code}
          id={id}
          code={share.data.code}
          notify={notify}
          changed={changed}
        />
      )}
    </>
  );
}
