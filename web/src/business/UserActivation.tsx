import { date } from "../api";
import { useResource } from "../hooks/useResource";
import Badge from "../components/Badge";
import Tag, { IdChip } from "../components/Tag";
import RequestState from "../components/RequestState";
import { codeKindName, joinMethod, roleName } from "./types";
import "./user-activation.css";

interface Source {
  kind: "owner" | "member" | "none";
  ownerOf?: string;
  membership?: { status: string; activatedAt: string };
  registration?: {
    role: string;
    codeKind: string;
    code: string;
    method: string;
    status: string;
    reason?: string;
    decidedAt?: string;
    registeredAt?: string;
  };
  referrer?: { id: string; name?: string; nickname?: string };
  chain: { id: string; name: string; role: string; status: string }[];
}
const registrations: Record<string, [string, string]> = {
  pending: ["待开通", "queued"],
  approved: ["已开通", "succeeded"],
  rejected: ["已拒绝", "failed"],
};
// A 会员's own authorization once opened.
const bindings: Record<string, [string, string]> = {
  active: ["授权有效", "succeeded"],
  disabled: ["授权已停用", "failed"],
  unbound: ["已解绑", "muted"],
  provider_disabled: ["上级已停用", "failed"],
};
const pretty = (code: string) => code.match(/.{1,4}/g)?.join("-");

// How a mini-program user registered and where they sit: the owner of a
// provider or a 会员 of one, the registration's review and the chain.
export default function UserActivation({ userId }: { userId: string }) {
  const resource = useResource<Source>(`/admin/users/${userId}/activation`),
    source = resource.data,
    reg = source?.registration,
    [state, tone] = (reg && registrations[reg.status]) || [],
    binding = source?.membership && bindings[source.membership.status],
    who = source?.referrer;
  return (
    <section className="user-source">
      <h3 className="business-section-title">开通来源</h3>
      <RequestState
        loading={resource.loading && !source}
        error={resource.error}
        retry={resource.reload}
      />
      {source && !reg && source.kind === "none" && (
        <p className="quiet">
          尚未登记：用户需扫描服务商的二维码登记，上级开通后才能使用生成功能。
        </p>
      )}
      {source && (reg || source.kind !== "none") && (
        <>
          <div className="source-head">
            {source.kind !== "none" && (
              <Tag tone="accent">
                {source.kind === "member" ? "会员" : "服务商负责人"}
              </Tag>
            )}
            {state && <Badge state={tone!} label={state} />}
            {binding && reg?.status === "approved" && (
              <Badge state={binding[1]} label={binding[0]} />
            )}
            {reg?.registeredAt && (
              <span className="quiet">登记于 {date(reg.registeredAt)}</span>
            )}
            {reg?.status === "approved" && reg.decidedAt && (
              <span className="quiet">开通于 {date(reg.decidedAt)}</span>
            )}
          </div>
          <dl className="source-grid">
            {reg && (
              <>
                <dt>登记身份</dt>
                <dd>{roleName(reg.role)}</dd>
                <dt>登记码</dt>
                <dd>
                  {codeKindName(reg.codeKind)}{" "}
                  <span className="source-code">{pretty(reg.code)}</span>
                  <span className="quiet"> · {joinMethod(reg.method)}</span>
                </dd>
                {reg.decidedAt && (
                  <>
                    <dt>{reg.status === "rejected" ? "拒绝" : "开通"}时间</dt>
                    <dd>{date(reg.decidedAt)}</dd>
                  </>
                )}
                {reg.reason && (
                  <>
                    <dt>拒绝原因</dt>
                    <dd>{reg.reason}</dd>
                  </>
                )}
              </>
            )}
            {who && (
              <>
                <dt>推荐人</dt>
                <dd>
                  {who.name || who.nickname || "未填写"}{" "}
                  <IdChip>{who.id}</IdChip>
                </dd>
              </>
            )}
            {source.chain.length > 0 && (
              <>
                <dt>服务商链路</dt>
                <dd>
                  <Chain chain={source.chain} />
                </dd>
              </>
            )}
          </dl>
        </>
      )}
    </section>
  );
}

// Platform → provider chain, the last entry being the user's own provider.
function Chain({ chain }: { chain: Source["chain"] }) {
  return (
    <ol className="source-chain" aria-label="服务商链路">
      <li>总账号</li>
      {chain.map((n, i) => (
        <li key={n.id} className={i === chain.length - 1 ? "current" : ""}>
          <b>{n.name}</b>
          <small>
            {roleName(n.role)}
            {n.status === "pending" && " · 待开通"}
            {n.status === "disabled" && " · 已停用"}
          </small>
        </li>
      ))}
    </ol>
  );
}
