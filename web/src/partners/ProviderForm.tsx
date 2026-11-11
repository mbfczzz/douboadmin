import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import type { Row } from "../api";
import Modal from "../components/Modal";
import ProviderLoginFields from "./ProviderLoginFields";
import type { Notify } from "../navigation";
import type { Partner } from "./types";
import { useCommand } from "./useCommand";

// Edit an existing provider or add a platform branch. Sub-providers join
// through scan registration and have no manual creation form.
export default function ProviderForm({
  row,
  onSaved,
  onClose,
  notify,
}: {
  row?: Row<Partner>;
  onSaved: () => Promise<void>;
  onClose: () => void;
  notify: Notify;
}) {
  const [dirty, setDirty] = useState(false);
  const command = useCommand();
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
              parentId: "root",
              name: String(data.get("name")),
              role: "branch",
              account: {
                username: String(data.get("accountUsername") || "").trim(),
                password: String(data.get("accountPassword") || ""),
                role: String(data.get("accountRole") || "branch"),
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
            <ProviderLoginFields disabled={command.busy} />
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
      title={row ? "编辑服务商" : "新增分公司"}
      subtitle={row?.data.name}
      onClose={guardedClose(command.busy, onClose)}
    >
      {form}
    </Modal>
  );
}
