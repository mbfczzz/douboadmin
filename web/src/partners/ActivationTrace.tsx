import type { Row } from "../api";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { Code, Membership } from "./types";
import { activationMethod, labels, traceTime } from "./types";
import { PartnerStatus } from "./PartnerIdentity";
import Badge from "../components/Badge";
import Tag, { IdChip } from "../components/Tag";
import DetailCard, { DetailHero, Field } from "../components/DetailCard";
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
  const state = value?.currentMembership,
    binding: [string, string] = !code?.userId
      ? ["尚未激活", "muted"]
      : !state
        ? ["绑定记录不可用", "muted"]
        : state.codeId !== value?.record.id
          ? ["已改用其他授权码", "muted"]
          : state.status === "active"
            ? ["绑定中", "succeeded"]
            : [labels[state.status] || state.status, "failed"];
  return (
    <Modal title="二维码生成与激活记录" onClose={onClose}>
      <div className="edit-form">
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        />
        {value && code && (
          <>
            <DetailHero
              value={`•••• ${code.suffix}`}
              caption={code.label || "未备注"}
            >
              <PartnerStatus state={code.status} />
            </DetailHero>
            <DetailCard title="生成">
              <Field label="生成账号">
                {code.creatorAccount || "历史未记录"}
              </Field>
              <Field label="生成时间">
                {traceTime(value.record.createdAt)}
              </Field>
              <Field label="生成者编号">
                {code.actor ? <IdChip>{code.actor}</IdChip> : "历史未记录"}
              </Field>
              <Field label="记录编号">
                <IdChip>{value.record.id}</IdChip>
              </Field>
            </DetailCard>
            <DetailCard title="归属服务商">
              <Field label="签发时">
                <Tag tone="accent">{code.partnerName || "历史未记录"}</Tag>
              </Field>
              <Field label="当前名称">{value.partnerName || "—"}</Field>
              <Field label="服务商编号">
                <IdChip>{code.partnerId}</IdChip>
              </Field>
            </DetailCard>
            <DetailCard title="激活">
              <Field label="当前绑定">
                <Badge state={binding[1]} label={binding[0]} />
              </Field>
              <Field label="激活用户">
                {code.userId ? <IdChip>{code.userId}</IdChip> : "尚未激活"}
              </Field>
              <Field label="激活时间">{traceTime(code.usedAt)}</Field>
              <Field label="激活方式">
                <Tag tone={code.activationMethod === "qr" ? "info" : "muted"}>
                  {activationMethod(code.activationMethod)}
                </Tag>
              </Field>
              <Field label="激活时昵称">
                {code.activatedNickname || "未记录"}
              </Field>
              <Field label="当前昵称 / 姓名">
                {value.user
                  ? [value.user.nickname, value.user.name]
                      .filter(Boolean)
                      .join(" / ") || "未填写"
                  : "—"}
              </Field>
            </DetailCard>
            <p className="quiet">
              生成者与归属服务商分别记录。解绑或更换授权后，原生成和激活记录仍保留。激活方式由客户端上报，旧数据未记录时不作推测。
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
