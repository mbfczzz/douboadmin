import { useState } from "react";
import Modal from "../components/Modal";
import Picker from "./Picker";
import { useCommand } from "./useCommand";
export default function QuotaForm({
  id,
  request,
  onClose,
  onSaved,
  notify,
}: {
  id: string;
  request: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [child, setChild] = useState(""),
    [picking, setPicking] = useState(false),
    command = useCommand();
  return (
    <>
      <Modal
        title={request ? "向上级申请名额" : "名额划拨 / 收回"}
        onClose={() => !command.busy && onClose()}
      >
        <form
          className="edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              values = {
                users: Number(f.get("users")),
                partners: Number(f.get("partners")),
                reason: String(f.get("reason")),
              };
            try {
              if (request)
                await command.send("/admin/quota-requests", {
                  ...values,
                  partnerId: id,
                });
              else {
                if (!child) throw Error("请选择直接下级");
                await command.send("/admin/quota-moves", {
                  ...values,
                  parentId: id,
                  childId: child,
                  kind: String(f.get("kind")),
                });
              }
              await onSaved();
              onClose();
              notify("名额操作已保存");
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          {!request && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => setPicking(true)}
              >
                {child ? "更换下级服务商" : "选择直接下级服务商"}
              </button>
              <small>{child}</small>
              <label>
                操作
                <select name="kind">
                  <option value="grant">划拨给下级</option>
                  <option value="reclaim">收回下级可用名额</option>
                </select>
              </label>
            </>
          )}
          <label>
            子账号名额
            <input
              name="users"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue="0"
              required
            />
          </label>
          <label>
            下级服务商名额
            <input
              name="partners"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue="0"
              required
            />
          </label>
          <p className="muted">
            两类名额不可互换。已激活、已预留或继续划拨的名额不能收回。
          </p>
          <label>
            原因
            <textarea name="reason" minLength={2} maxLength={200} required />
          </label>
          <button className="primary" disabled={command.busy}>
            {request ? "提交申请" : "确认名额操作"}
          </button>
        </form>
      </Modal>
      {picking && (
        <Picker
          owner={id}
          onClose={() => setPicking(false)}
          onChoose={(value) => {
            setChild(value);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
