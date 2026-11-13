import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import { api } from "../api";
import Modal from "../components/Modal";
import { pageInfo, type Notify, type PageId } from "../navigation";
import { roleScopeLabel, type RoleRow, type RoleScope } from "./types";

// Create or edit a role: name, scope (fixed after creation) and visible menus.
export default function RoleForm({
  row,
  notify,
  onClose,
  onSaved,
}: {
  row: RoleRow | null;
  notify: Notify;
  onClose: () => void;
  onSaved: () => unknown;
}) {
  const [scope, setScope] = useState<RoleScope>(row?.data.scope || "platform"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  async function save(form: HTMLFormElement) {
    const name = String(new FormData(form).get("name") || "").trim();
    const chosen = scope === "user" ? [] : ["partners"];
    setBusy(true);
    setError("");
    try {
      const body = { name, scope, menus: chosen, version: row?.version || 0 };
      await api(row ? `/admin/roles/${row.id}` : "/admin/roles", {
        method: row ? "PUT" : "POST",
        body: JSON.stringify(body),
        confirmation: row
          ? {
              before: row.data,
              title: "确认修改角色",
              format: {
                menus: (v) =>
                  (v as PageId[])
                    .map((id) => pageInfo[id]?.[0] || id)
                    .join("、"),
                scope: (v) => roleScopeLabel[v as RoleScope] || String(v),
              },
            }
          : undefined,
      });
      await onSaved();
      notify(row ? "角色已更新" : "角色已创建");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title={row ? "编辑角色" : "新增角色"}
      onClose={guardedClose(busy, onClose)}
    >
      <form
        className="edit-form"
        onChange={() => setDirty(true)}
        data-unsaved={dirty || busy || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <div className="form-body">
          <label>
            角色名称
            <input
              name="name"
              defaultValue={row?.data.name}
              maxLength={20}
              required
              disabled={busy}
            />
          </label>
          <label>
            角色类型
            <select
              value={scope}
              disabled={busy || !!row}
              onChange={(e) => {
                setScope(e.target.value as RoleScope);
              }}
            >
              {(row?.data.scope === "user"
                ? (["user"] as const)
                : (["platform", "partner"] as const)
              ).map((s) => (
                <option key={s} value={s}>
                  {roleScopeLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="quiet">
            {scope === "user"
              ? "此角色用于小程序用户展示，不授予管理后台登录或菜单权限。"
              : scope === "partner"
                ? "服务商角色绑定到具体服务商，只能看到本服务商及其下级的数据。"
                : "非超管后台账号权限固定，未关联服务商时没有下级数据。"}
          </p>
          {scope !== "user" && (
            <fieldset className="role-menus">
              <legend>固定后台权限</legend>
              <p>给下级设置算力分佣、查看下级活动轨迹、查看分佣。</p>
              <p className="quiet">
                除超级管理员外，不能通过角色配置扩大上述权限。
              </p>
            </fieldset>
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
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存角色"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
