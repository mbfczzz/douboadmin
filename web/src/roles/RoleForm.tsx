import { useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { navGroups, pageInfo, type Notify, type PageId } from "../navigation";
import {
  partnerMenus,
  roleScopeLabel,
  type RoleRow,
  type RoleScope,
} from "./types";

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
    [menus, setMenus] = useState<string[]>(row?.data.menus || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const groups =
    scope === "partner"
      ? [{ label: "服务商菜单", pages: partnerMenus as PageId[] }]
      : navGroups;
  const toggle = (id: string, on: boolean) =>
    setMenus((current) =>
      on ? [...current, id] : current.filter((m) => m !== id),
    );
  async function save(form: HTMLFormElement) {
    const name = String(new FormData(form).get("name") || "").trim();
    const chosen = menus.filter((m) =>
      groups.some((g) => g.pages.includes(m as PageId)),
    );
    if (!chosen.length) return setError("请至少选择一个菜单");
    setBusy(true);
    setError("");
    try {
      const body = { name, scope, menus: chosen, version: row?.version || 0 };
      await api(row ? `/admin/roles/${row.id}` : "/admin/roles", {
        method: row ? "PUT" : "POST",
        body: JSON.stringify(body),
        confirmation: row ? { before: row.data } : undefined,
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
      onClose={() => !busy && onClose()}
    >
      <form
        className="edit-form"
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
                setMenus([]);
              }}
            >
              {(["platform", "partner"] as const).map((s) => (
                <option key={s} value={s}>
                  {roleScopeLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="quiet">
            {scope === "partner"
              ? "服务商角色绑定到具体服务商，只能看到本服务商及其下级的数据。"
              : "平台角色用于管理后台账号，可访问勾选的全部菜单。"}
          </p>
          {groups.map((group) => (
            <fieldset key={group.label} className="role-menus">
              <legend>{group.label}</legend>
              {group.pages.map((id) => (
                <label className="checkbox" key={id}>
                  <input
                    type="checkbox"
                    checked={menus.includes(id)}
                    disabled={busy}
                    onChange={(e) => toggle(id, e.target.checked)}
                  />
                  {pageInfo[id][0]}
                </label>
              ))}
            </fieldset>
          ))}
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
