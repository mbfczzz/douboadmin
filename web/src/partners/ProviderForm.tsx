import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import type { Row } from "../api";
import Modal from "../components/Modal";
import ProviderLoginFields from "./ProviderLoginFields";
import type { Notify } from "../navigation";
import { growth, type Partner } from "./types";
import { roleName } from "../business/types";
import { useCommand } from "./useCommand";

// Edits a provider, or adds one below `parent` (platform only): a 分公司
// under the platform, an S1 or S2 under a 分公司, an S2 under an S1.
export default function ProviderForm({
  parent,
  row,
  onSaved,
  onClose,
  notify,
}: {
  parent?: Row<Partner> | "root";
  row?: Row<Partner>;
  onSaved: () => Promise<void>;
  onClose: () => void;
  notify: Notify;
}) {
  const [dirty, setDirty] = useState(false);
  const command = useCommand(),
    roles = growth[parent === "root" ? "root" : parent?.data.role || ""] || [];
  const form = (
    <form
      className="edit-form"
      aria-busy={command.busy}
      onChange={() => setDirty(true)}
      data-unsaved={dirty || command.busy || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          if (row)
            await command.send(
              "/admin/partners/" + row.id,
              {
                version: row.version,
                data: {
                  ...row.data,
                  name: String(data.get("name")),
                  status: data.get("enabled") ? "active" : "disabled",
                },
              },
              "PUT",
              { before: row.data },
            );
          else
            await command.send("/admin/partners", {
              parentId: parent === "root" ? "root" : parent?.id,
              name: String(data.get("name")),
              role: String(data.get("role") || roles[0]),
              account: {
                username: String(data.get("accountUsername") || "").trim(),
                password: String(data.get("accountPassword") || ""),
                role: String(data.get("accountRole") || "partner"),
              },
            });
          await onSaved();
          onClose();
          notify("服务商已保存");
        } catch (error) {
          notify((error as Error).message, "error");
        }
      }}
    >
      <div className="form-body">
        <fieldset disabled={command.busy}>
          <label>
            服务商名称
            <input
              name="name"
              defaultValue={row?.data.name}
              maxLength={60}
              required
            />
          </label>
          {row ? (
            <>
              <label className="checkbox">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={row.data.status === "active"}
                />{" "}
                启用服务商
              </label>
              <p className="quiet">停用会暂停整个下级链路的使用权限。</p>
            </>
          ) : (
            <>
              {roles.length > 1 && (
                <label>
                  服务商级别
                  <select name="role" defaultValue={roles[0]}>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleName(role)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <ProviderLoginFields disabled={command.busy} />
            </>
          )}
        </fieldset>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="secondary"
          disabled={command.busy}
          onClick={onClose}
        >
          取消
        </button>
        <button className="primary" disabled={command.busy}>
          {command.busy ? "保存中…" : "保存服务商"}
        </button>
      </div>
    </form>
  );
  return (
    <Modal
      className="form-modal"
      title={
        row ? "编辑服务商" : parent === "root" ? "新增分公司" : "新增下级服务商"
      }
      subtitle={
        row?.data.name ||
        (parent && parent !== "root" ? `上级：${parent.data.name}` : undefined)
      }
      onClose={guardedClose(command.busy, onClose)}
    >
      {form}
    </Modal>
  );
}
