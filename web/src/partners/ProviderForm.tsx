import { useState } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import type { Partner } from "./types";
import { hundredths } from "./types";
import { useCommand } from "./useCommand";

export default function ProviderForm({
  parent,
  row,
  onSaved,
  onClose,
  notify,
  embedded = false,
  parentAvailable,
}: {
  parent: string;
  row?: Row<Partner>;
  onSaved: () => Promise<void>;
  onClose: () => void;
  notify: Notify;
  embedded?: boolean;
  parentAvailable?: number;
}) {
  const command = useCommand(),
    [users, setUsers] = useState(""),
    limited = !row && parent !== "root",
    noAvailable = limited && (parentAvailable ?? 0) < 1,
    overAvailable = limited && Number(users) > (parentAvailable ?? 0),
    remaining = limited
      ? Math.max(0, (parentAvailable ?? 0) - (Number(users) || 0))
      : undefined;
  const form = (
    <form
      className="edit-form"
      aria-busy={command.busy}
      data-unsaved={command.busy || undefined}
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
                  retailPer100Fen: hundredths(data.get("retail")),
                  childMarginBps: hundredths(data.get("margin")),
                },
              },
              "PUT",
            );
          else
            await command.send("/admin/partners", {
              parentId: parent,
              name: String(data.get("name")),
              users: Number(data.get("users")),
            });
          await onSaved();
          onClose();
          notify("服务商已保存");
        } catch (error) {
          notify((error as Error).message, "error");
        }
      }}
    >
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
            <div className="form-grid">
              <label>
                子账号售价（每 100 元基准算力）
                <input
                  name="retail"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={row.data.retailPer100Fen / 100}
                  required
                />
              </label>
              <label>
                向下级供货时保留毛利（%）
                <input
                  name="margin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={row.data.childMarginBps / 100}
                  required
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={row.data.status === "active"}
              />{" "}
              启用服务商
            </label>
            <p className="quiet">
              停用会暂停整个下级链路的使用权限，但不释放名额。上级调价后，低于进价的下级将暂停充值，需调整售价。
            </p>
          </>
        ) : (
          <>
            <label>
              可授权账号额度
              <input
                name="users"
                type="number"
                min="1"
                max={limited ? parentAvailable : 1000000}
                step="1"
                value={users}
                onChange={(event) => setUsers(event.target.value)}
                disabled={noAvailable}
                required
              />
            </label>
            <p className="muted" aria-live="polite">
              {limited
                ? noAvailable
                  ? "上级当前没有可划拨额度，请先补充或收回额度。"
                  : overAvailable
                    ? `本次额度超出上级可用额度 ${Number(users) - (parentAvailable ?? 0)} 个，请调小后再保存。`
                    : `上级当前可用 ${parentAvailable} 个，本次分配后预计剩余 ${remaining} 个。`
                : "一级服务商额度不占用总账号额度，可直接设置初始可授权账号数。"}
            </p>
          </>
        )}
        <div className="modal-actions">
          <button
            className="primary"
            disabled={command.busy || noAvailable || overAvailable}
          >
            {command.busy ? "保存中…" : "保存服务商"}
          </button>
        </div>
      </fieldset>
    </form>
  );
  if (embedded) return form;
  return (
    <Modal
      title={
        row ? "编辑服务商" : parent === "root" ? "新增服务商" : "新增下级服务商"
      }
      onClose={() => !command.busy && onClose()}
    >
      {form}
    </Modal>
  );
}
