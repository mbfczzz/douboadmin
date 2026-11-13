import { useState } from "react";
import { api, APIError, type Row } from "../api";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import type { Partner } from "./types";

type Impact = {
  name: string;
  providers: number;
  accounts: number;
  members: number;
  users: number;
  token: string;
};
export default function DeleteProvider({
  row,
  onClose,
  onSaved,
  notify,
}: {
  row: Row<Partner>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notify;
}) {
  const path = `/admin/partners/${encodeURIComponent(row.id)}`;
  const impact = useResource<Impact>(path + "/delete-preview");
  const [name, setName] = useState(""),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Modal
      title="删除服务商及下级"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="edit-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            busy ||
            !impact.data ||
            name !== impact.data.name ||
            !acknowledged
          )
            return;
          setBusy(true);
          setError("");
          try {
            await api(path, {
              method: "DELETE",
              confirmation: false,
              body: JSON.stringify({
                token: impact.data.token,
                confirm: "delete-users",
                reason: reason.trim(),
              }),
            });
            await onSaved();
            onClose();
            notify("服务商、全部下级结构及所属用户账号已删除");
          } catch (e) {
            setError((e as Error).message);
            if (e instanceof APIError && e.status === 409) {
              setName("");
              setAcknowledged(false);
              await impact.reload();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <RequestState
            loading={impact.loading}
            error={impact.error}
            retry={impact.reload}
          />
          {impact.data && (
            <>
              <p>
                将删除「{impact.data.name}」及全部下级，共{" "}
                {impact.data.providers} 个服务商节点。
              </p>
              <p>
                同时删除 {impact.data.users}{" "}
                个用户账号（含负责人、会员和待审核用户），小程序、App及其他用户端的现有登录将失效。
              </p>
              <p>
                关联的 {impact.data.accounts} 个后台账号也将删除，邀请码作废。
              </p>
              <p className="quiet">
                此操作不可从界面恢复。订单、作品和历史账目仅保留用于追溯，已删除用户无法继续访问。
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={busy}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                我确认同时删除上述用户账号
              </label>
              <label>
                删除原因
                <textarea
                  required
                  minLength={3}
                  maxLength={200}
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                输入服务商全名确认
                <input
                  required
                  autoComplete="off"
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="danger"
            disabled={
              busy ||
              impact.loading ||
              !!impact.error ||
              !acknowledged ||
              !impact.data ||
              name !== impact.data.name ||
              reason.trim().length < 3
            }
          >
            {busy ? "删除中…" : "确认删除结构和用户"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
