import { useState } from "react";
import type { Row } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import Tag from "../components/Tag";
import RequestState from "../components/RequestState";
import PasswordReset from "../components/PasswordReset";
import { useRoles } from "../roles/types";
import { lastLogin, type AdminAccount } from "../adminAccounts/types";
import type { Notify } from "../navigation";
import type { Partner } from "./types";
import { AccountCreate, RoleChange } from "./ProviderAccountForms";
import { saveAccount } from "./accountActions";

type Sub = "role" | "password";

// Login account of one provider. Each change is its own button and dialog:
// open the account, change its role, reset its password, disable/enable it.
export default function ProviderAccount({
  row,
  notify,
  onClose,
}: {
  row: Row<Partner>;
  notify: Notify;
  onClose: () => void;
}) {
  const resource = useResource<{ account: Row<AdminAccount> | null }>(
      `/admin/partners/${row.id}/account`,
    ),
    roles = useRoles("partner"),
    [sub, setSub] = useState<Sub>(),
    account = resource.data?.account;
  const done = async (message: string) => {
    await resource.reload();
    notify(message);
  };
  async function toggle(current: Row<AdminAccount>) {
    try {
      await saveAccount(
        row.id,
        current,
        { disabled: !current.data.disabled },
        roles.name,
      );
      await done(current.data.disabled ? "登录已启用" : "登录已停用");
    } catch (e) {
      notify((e as Error).message, "error");
      void resource.reload();
    }
  }
  return (
    <Modal
      className="form-modal provider-account"
      title="登录账号"
      subtitle={row.data.name}
      onClose={onClose}
    >
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && !account && (
        <AccountCreate
          id={row.id}
          onClose={onClose}
          onSaved={() => done("登录账号已开通")}
        />
      )}
      {account && (
        <div className="edit-form">
          <div className="form-body">
            <dl className="detail-grid compact account-facts">
              <dt>账号</dt>
              <dd className="mono">{account.data.username}</dd>
              <dt>角色</dt>
              <dd>
                <Tag tone="accent">
                  {roles.rows.find((r) => r.id === account.data.role)?.data
                    .name || account.data.role}
                </Tag>
              </dd>
              <dt>状态</dt>
              <dd>
                <Badge
                  state={account.data.disabled ? "failed" : "succeeded"}
                  label={account.data.disabled ? "已停用" : "正常"}
                />
              </dd>
              <dt>最后登录</dt>
              <dd>{lastLogin(account.data.lastLoginAt)}</dd>
            </dl>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className={
                account.data.disabled ? "secondary" : "secondary danger-text"
              }
              onClick={() => void toggle(account)}
            >
              {account.data.disabled ? "启用登录" : "停用登录"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSub("role")}
            >
              修改角色
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setSub("password")}
            >
              重置密码
            </button>
          </div>
        </div>
      )}
      {account && sub === "role" && (
        <RoleChange
          partnerId={row.id}
          account={account}
          onClose={() => setSub(undefined)}
          onFailed={() => void resource.reload()}
          onSaved={() => done("账号角色已更新")}
        />
      )}
      {account && sub === "password" && (
        <PasswordReset
          account={
            <>
              {row.data.name} ·{" "}
              <span className="nowrap">{account.data.username}</span>
            </>
          }
          onClose={() => setSub(undefined)}
          onSubmit={async (password) => {
            try {
              await saveAccount(row.id, account, { password });
            } catch (e) {
              // A login in the meantime changes the version; refresh so a
              // retry uses the current one.
              void resource.reload();
              throw e;
            }
            await done("密码已重置");
          }}
        />
      )}
    </Modal>
  );
}
