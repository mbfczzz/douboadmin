import { useState } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import LogTable from "../logs/LogTable";
import type { Profile } from "../business/types";
import "../logs/logs.css";
import "./records.css";

const scopes = [
  ["ops", "操作记录", "登录、开通、生成、充值、资料修改等有业务含义的操作"],
  ["all", "全部请求", "另含浏览类接口调用和为该用户执行的模型调用"],
] as const;

// What one user did, from the operation log, newest first.
export default function UserActivity({
  user,
  onClose,
}: {
  user: Row<Profile>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<(typeof scopes)[number][0]>("ops"),
    base = `/admin/users/${encodeURIComponent(user.id)}/activity`;
  return (
    <Modal
      title="行为日志"
      subtitle={user.data.nickname || user.id}
      onClose={onClose}
      style={{ width: "min(1080px, 100%)" }}
    >
      <div className="edit-form user-records">
        <div className="records-scopes" role="tablist" aria-label="记录范围">
          {scopes.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              onClick={() => setScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="quiet records-summary">
          {scopes.find(([id]) => id === scope)?.[2]}
        </p>
        <LogTable
          key={scope}
          tab="user"
          query=""
          source={{ list: `${base}?scope=${scope}`, detail: base + "/" }}
        />
      </div>
    </Modal>
  );
}
