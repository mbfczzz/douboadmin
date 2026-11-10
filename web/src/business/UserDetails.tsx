import { date, type Row } from "../api";
import { useState } from "react";
import type { RecordPage } from "./recordPage";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import Table from "./Table";
import RequestState from "../components/RequestState";
import Badge from "../components/Badge";
import Tag, { Delta, IdChip } from "../components/Tag";
import UserActivation from "./UserActivation";
import { phoneVerified } from "../users/registration";
import {
  points,
  ledgerLabels,
  ledgerTones,
  type Ledger,
  type Profile,
  type Wallet,
} from "./types";

export const userState = (p: Profile) =>
  p.archived
    ? (["muted", "已归档"] as const)
    : p.disabled
      ? (["failed", "已停用"] as const)
      : (["succeeded", "正常"] as const);

// Read-only view: balance, activation source and points history. Changes are
// made from the dedicated row actions, each in its own small dialog.
export default function UserDetails({
  user,
  onClose,
}: {
  user: Row<Profile>;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const ledger = useResource<RecordPage<Ledger>>(
      `/admin/users/${user.id}/ledger?page=${page}`,
    ),
    wallet = useResource<{ wallet: Wallet }>(`/admin/users/${user.id}/wallet`),
    [tone, label] = userState(user.data),
    verified = phoneVerified(user.data);
  return (
    <Modal
      title="用户详情"
      onClose={onClose}
      style={{ width: "min(780px, 100%)" }}
    >
      <div className="edit-form user-detail">
        <header className="user-head">
          <div>
            <h3>{user.data.nickname || "未设置昵称"}</h3>
            <IdChip>{user.id}</IdChip>
          </div>
          <Badge state={tone} label={label} />
        </header>
        <dl className="user-facts">
          <dt>姓名</dt>
          <dd>{user.data.name || "未填写"}</dd>
          <dt>手机号</dt>
          <dd>
            {user.data.phone
              ? `${user.data.phone}（${verified ? "已验证" : "未验证"}）`
              : "未填写"}
          </dd>
          {verified && user.data.phoneVerifiedAt && (
            <>
              <dt>验证时间</dt>
              <dd>{date(user.data.phoneVerifiedAt)}</dd>
            </>
          )}
          <dt>注册时间</dt>
          <dd>{date(user.createdAt)}</dd>
        </dl>
        <div className="business-metrics">
          {(
            [
              ["可用积分", "availableUnits"],
              ["预留积分", "heldUnits"],
            ] as const
          ).map(([name, key]) => (
            <div className="panel" key={key}>
              <span>{name}</span>
              <strong>
                {wallet.data ? points(wallet.data.wallet[key]) : "—"}
              </strong>
            </div>
          ))}
        </div>
        <RequestState
          error={wallet.error || ledger.error}
          retry={() => {
            void wallet.reload();
            void ledger.reload();
          }}
        />
        <UserActivation userId={user.id} />
        <h3 className="business-section-title">积分流水</h3>
        <Table
          rows={ledger.data?.items || []}
          pagination={{
            page,
            size: ledger.data?.size,
            total: ledger.data?.total || 0,
            onChange: setPage,
          }}
          id={(r) => r.id}
          columns={[
            {
              title: "类型",
              render: (r) => (
                <Tag tone={ledgerTones[r.data.kind]}>
                  {ledgerLabels[r.data.kind] || r.data.kind}
                </Tag>
              ),
            },
            {
              title: "可用变动",
              render: (r) => (
                <Delta value={r.data.availableDelta}>
                  {points(r.data.availableDelta)}
                </Delta>
              ),
            },
            { title: "说明", render: (r) => r.data.note },
            { title: "时间", render: (r) => date(r.createdAt) },
          ]}
        />
      </div>
    </Modal>
  );
}
