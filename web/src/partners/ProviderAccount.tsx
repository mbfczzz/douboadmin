import { useState } from "react";
import { api, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import RoleSelect from "../roles/RoleSelect";
import type { AdminAccount } from "../adminAccounts/types";
import type { Notify } from "../navigation";

// Login account of one provider: create it, reset the password, change role or disable.
export default function ProviderAccount({
  id,
  notify,
}: {
  id: string;
  notify: Notify;
}) {
  const resource = useResource<{ account: Row<AdminAccount> | null }>(
      `/admin/partners/${id}/account`,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const account = resource.data?.account;
  async function save(form: HTMLFormElement) {
    const data = new FormData(form),
      body = {
        version: account?.version || 0,
        username: String(data.get("username") || "").trim(),
        password: String(data.get("password") || ""),
        role: String(data.get("role") || "partner"),
        disabled: !!data.get("disabled"),
      };
    setBusy(true);
    setError("");
    try {
      await api(`/admin/partners/${id}/account`, {
        method: "PUT",
        body: JSON.stringify(body),
        confirmation: account
          ? {
              before: account.data,
              extra: body.password ? { password: body.password } : undefined,
            }
          : false,
      });
      form.reset();
      await resource.reload();
      notify(account ? "登录账号已更新" : "登录账号已开通");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="edit-form provider-account"
      onSubmit={(e) => {
        e.preventDefault();
        void save(e.currentTarget);
      }}
    >
      <h3>登录账号</h3>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <fieldset disabled={busy}>
          {account ? (
            <p className="quiet">
              账号 <b className="mono">{account.data.username}</b>
              {account.data.lastLoginAt ? "" : " · 尚未登录"}
            </p>
          ) : (
            <p className="quiet">
              该服务商还没有登录账号，开通后即可登录后台。
            </p>
          )}
          <div className="form-grid">
            {!account && (
              <label>
                账号
                <input
                  name="username"
                  pattern="[A-Za-z0-9._-]{3,32}"
                  autoComplete="off"
                  required
                />
              </label>
            )}
            <label>
              {account ? "重置密码（不修改请留空）" : "初始密码"}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={16}
                maxLength={128}
                required={!account}
              />
            </label>
            <label>
              角色
              <RoleSelect scope="partner" value={account?.data.role} />
            </label>
          </div>
          {account && (
            <label className="checkbox">
              <input
                type="checkbox"
                name="disabled"
                defaultChecked={account.data.disabled}
              />
              停用登录
            </label>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button className="primary" disabled={busy}>
              {busy ? "保存中…" : account ? "保存账号" : "开通账号"}
            </button>
          </div>
        </fieldset>
      )}
    </form>
  );
}
