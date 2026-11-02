import type { Row } from "../api";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { Code, Membership } from "./types";
import { activationMethod, labels, traceTime } from "./types";
interface Trace {
  record: Row<Code>;
  partnerName: string;
  user?: { id: string; nickname: string; name: string };
  currentMembership?: Membership;
}
export default function ActivationTrace({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const resource = useResource<Trace>(
      "/admin/activation-codes/" + id + "/trace",
    ),
    value = resource.data,
    code = value?.record.data;
  const state = value?.currentMembership;
  return (
    <Modal title="二维码生成与激活记录" onClose={onClose}>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      />
      {value && code && (
        <div className="edit-form">
          <dl className="partner-form-grid" style={{ fontSize: 13 }}>
            {Object.entries({
              生成账号: code.creatorAccount || "历史未记录",
              生成时间: traceTime(value.record.createdAt),
              "归属服务商（签发时）": code.partnerName || "历史未记录",
              服务商当前名称: value.partnerName || "—",
              激活用户编号: code.userId || "尚未激活",
              激活时间: traceTime(code.usedAt),
              激活时昵称: code.activatedNickname || "未记录",
              "用户当前昵称 / 姓名": value.user
                ? [value.user.nickname, value.user.name]
                    .filter(Boolean)
                    .join(" / ") || "未填写"
                : "—",
              激活方式: activationMethod(code.activationMethod),
              当前绑定: !code.userId
                ? "尚未激活"
                : !state
                  ? "绑定记录不可用"
                  : state.codeId !== value.record.id
                    ? "已改用其他授权码"
                    : state.status === "active"
                      ? "绑定中"
                      : labels[state.status] || state.status,
              生成者编号: code.actor || "历史未记录",
              服务商编号: code.partnerId,
              授权码记录编号: value.record.id,
            }).map(([label, text]) => (
              <div key={label}>
                <dt style={{ color: "inherit", opacity: 0.75 }}>{label}</dt>
                <dd style={{ color: "inherit", fontSize: 14, lineHeight: 1.6 }}>
                  {text}
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            生成者与归属服务商分别记录。解绑或更换授权后，原生成和激活记录仍保留。激活方式由客户端上报，旧数据未记录时不作推测。
          </p>
        </div>
      )}
    </Modal>
  );
}
