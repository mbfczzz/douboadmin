import { useState } from "react";
import { date, type Row } from "../api";
import Modal from "../components/Modal";
import Records, { useRecords } from "./Records";
import { useCommand } from "./useCommand";
import type { Membership } from "./types";
import { PartnerIdentity, PartnerStatus } from "./PartnerIdentity";
import ActivationTrace from "./ActivationTrace";
import type { Notify } from "../navigation";
export default function Memberships({
  id,
  notify,
  changed,
}: {
  id: string;
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const resource = useRecords<Membership>(
      "/admin/memberships?provider=" + id,
      15000,
    ),
    [detail, setDetail] = useState<Row<Membership> | null>(null),
    [trace, setTrace] = useState(""),
    command = useCommand();
  return (
    <>
      <Records
        title="用户授权绑定"
        description="可按微信用户编号或服务商编号检索。停用不释放名额，解绑才释放。"
        resource={resource}
        columns={[
          { title: "微信用户", render: (r) => r.id },
          {
            title: "服务商",
            render: (r) => <PartnerIdentity id={r.data.partnerId} />,
          },
          {
            title: "授权",
            render: (r) => <PartnerStatus state={r.data.status} />,
          },
          { title: "激活时间", render: (r) => date(r.data.activatedAt) },
          {
            title: "来源",
            render: (r) => (
              <button
                className="text-button"
                onClick={() => setTrace(r.data.codeId)}
              >
                查看授权码记录
              </button>
            ),
          },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <button
                className="text-button"
                disabled={r.data.status === "unbound"}
                onClick={() => setDetail(r)}
              >
                管理授权
              </button>
            ),
          },
        ]}
      />
      {detail && (
        <Modal
          className="form-modal"
          title="管理用户授权"
          onClose={() => !command.busy && setDetail(null)}
        >
          <form
            className="edit-form"
            aria-busy={command.busy}
            data-unsaved={command.busy || undefined}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                status = String(f.get("status"));
              if (
                status === "unbound" &&
                !confirm(
                  "解绑将停止使用权限并释放一个名额；已有作品、订单和历史分佣归属保留。确定解绑？",
                )
              )
                return;
              try {
                await command.send(
                  "/admin/memberships/" + detail.id,
                  {
                    version: detail.version,
                    status,
                    reason: String(f.get("reason")),
                  },
                  "PUT",
                );
                setDetail(null);
                await resource.reload();
                await changed();
                notify("授权状态已更新");
              } catch (e) {
                notify((e as Error).message, "error");
              }
            }}
          >
            <div className="form-body">
              <fieldset disabled={command.busy}>
                <p>{detail.id}</p>
                <label>
                  操作
                  <select
                    name="status"
                    defaultValue={
                      detail.data.status === "active" ? "disabled" : "active"
                    }
                  >
                    <option value="active">恢复授权</option>
                    <option value="disabled">停用授权（保留名额）</option>
                    <option value="unbound">解绑授权（释放名额）</option>
                  </select>
                </label>
                <label>
                  原因
                  <textarea
                    name="reason"
                    minLength={2}
                    maxLength={200}
                    required
                  />
                </label>
              </fieldset>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={command.busy}
                onClick={() => !command.busy && setDetail(null)}
              >
                取消
              </button>
              <button className="primary" disabled={command.busy}>
                保存授权状态
              </button>
            </div>
          </form>
        </Modal>
      )}
      {trace && <ActivationTrace id={trace} onClose={() => setTrace("")} />}
    </>
  );
}
