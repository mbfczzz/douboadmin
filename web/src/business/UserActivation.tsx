import { date } from "../api";
import { useResource } from "../hooks/useResource";
import Badge from "../components/Badge";
import Tag from "../components/Tag";
import RequestState from "../components/RequestState";
import "./user-activation.css";

interface Source {
  kind: "provider" | "direct" | "none";
  directAt?: string;
  membership?: { status: string; activatedAt: string; reason?: string };
  chain: { id: string; name: string; status: string; level: number }[];
  code?: {
    code?: string;
    label: string;
    suffix: string;
    creatorAccount?: string;
    createdAt: string;
    usedAt?: string;
    method?: string;
  };
}
const levels = ["", "一级", "二级", "三级"];
const bindings: Record<string, [string, string]> = {
  active: ["授权有效", "succeeded"],
  disabled: ["授权已停用", "failed"],
  unbound: ["已解绑", "muted"],
  provider_disabled: ["上级已停用", "failed"],
};

// How a mini-program user was activated: provider chain and redeemed code.
export default function UserActivation({ userId }: { userId: string }) {
  const resource = useResource<Source>(`/admin/users/${userId}/activation`),
    source = resource.data;
  return (
    <section className="user-source">
      <h3 className="business-section-title">开通来源</h3>
      <RequestState
        loading={resource.loading && !source}
        error={resource.error}
        retry={resource.reload}
      />
      {source?.kind === "none" && (
        <p className="quiet">尚未开通：用户需直接申请或使用服务商激活码。</p>
      )}
      {source?.kind === "direct" && (
        <div className="source-head">
          <Tag tone="info">直接开通</Tag>
          <span className="quiet">
            {source.directAt && date(source.directAt)} · 不归属任何服务商
          </span>
        </div>
      )}
      {source?.kind === "provider" && source.membership && (
        <>
          <div className="source-head">
            <Tag tone="accent">服务商激活</Tag>
            <Badge
              state={bindings[source.membership.status]?.[1] || "muted"}
              label={
                bindings[source.membership.status]?.[0] ||
                source.membership.status
              }
            />
            <span className="quiet">
              激活于 {date(source.membership.activatedAt)}
            </span>
          </div>
          <dl className="source-grid">
            <dt>服务商链路</dt>
            <dd>
              <ol className="source-chain" aria-label="服务商链路">
                <li>总账号</li>
                {source.chain.map((n, i) => (
                  <li
                    key={n.id}
                    className={i === source.chain.length - 1 ? "current" : ""}
                  >
                    <b>{n.name}</b>
                    <small>
                      {levels[n.level] || `${n.level}级`}
                      {n.status !== "active" && " · 已停用"}
                    </small>
                  </li>
                ))}
              </ol>
            </dd>
            {source.code && (
              <>
                <dt>激活码</dt>
                <dd>
                  <span className="source-code">
                    {source.code.code
                      ? source.code.code.match(/.{1,4}/g)?.join("-")
                      : `•••• ${source.code.suffix}`}
                  </span>
                  {source.code.label && (
                    <small className="cell-note">
                      备注：{source.code.label}
                    </small>
                  )}
                </dd>
                <dt>生成者</dt>
                <dd>
                  {source.code.creatorAccount || "未记录"}
                  <small className="cell-note">
                    {date(source.code.createdAt)}
                  </small>
                </dd>
                <dt>激活方式</dt>
                <dd>
                  <Tag tone={source.code.method === "qr" ? "info" : "muted"}>
                    {source.code.method === "qr"
                      ? "扫码"
                      : source.code.method === "code"
                        ? "输入激活码"
                        : "未记录"}
                  </Tag>
                </dd>
              </>
            )}
          </dl>
        </>
      )}
    </section>
  );
}
