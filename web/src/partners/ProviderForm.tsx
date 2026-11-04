import type { Row } from "../api";
import Modal from "../components/Modal";
import type { Partner } from "./types";
import { hundredths } from "./types";
import { useCommand } from "./useCommand";
import type { Notify } from "../navigation";
export default function ProviderForm({
  parent,
  row,
  onSaved,
  onClose,
  notify,
}: {
  parent: string;
  row?: Row<Partner>;
  onSaved: () => Promise<void>;
  onClose: () => void;
  notify: Notify;
}) {
  const command = useCommand();
  return (
    <Modal
      title={row ? "编辑服务商" : "新增下级服务商"}
      onClose={() => !command.busy && onClose()}
    >
      <form
        className="edit-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            if (row)
              await command.send(
                "/admin/partners/" + row.id,
                {
                  version: row.version,
                  data: {
                    ...row.data,
                    name: String(form.get("name")),
                    status: form.get("enabled") ? "active" : "disabled",
                    retailPer100Fen: hundredths(form.get("retail")),
                    childMarginBps: hundredths(form.get("margin")),
                  },
                },
                "PUT",
              );
            else
              await command.send("/admin/partners", {
                parentId: parent,
                name: String(form.get("name")),
              });
            await onSaved();
            onClose();
            notify("服务商已保存");
          } catch (error) {
            notify((error as Error).message, "error");
          }
        }}
      >
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
            <label className="checkbox">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={row.data.status === "active"}
              />{" "}
              启用服务商
            </label>
            <p className="muted">
              停用会暂停整个下级链路的使用权限，但不释放名额。上级调价后，低于进价的下级将暂停充值，需调整售价。
            </p>
          </>
        ) : (
          <p className="muted">
            创建服务商不占用户额度。创建后由上级从固定总额度中另行划拨。
          </p>
        )}
        <button className="primary" disabled={command.busy}>
          {command.busy ? "保存中…" : "保存服务商"}
        </button>
      </form>
    </Modal>
  );
}
