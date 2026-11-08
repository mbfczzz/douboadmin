import { useState } from "react";
import { api, date, type Row } from "../api";
import Modal from "../components/Modal";
import Records, { useRecords } from "./Records";
import type { Code, Scope } from "./types";
import { activationMethod, traceTime } from "./types";
import { PartnerIdentity, PartnerStatus } from "./PartnerIdentity";
import { useCommand } from "./useCommand";
import CodeReveal from "./CodeReveal";
import Memberships from "./Memberships";
import ActivationTrace from "./ActivationTrace";
export default function Codes({ id, view, changed, notify }: Scope) {
  const [all, setAll] = useState(false);
  const resource = useRecords<Code>(
      "/admin/activation-codes" + (all ? "" : "?owner=" + id),
      15000,
    ),
    [creating, setCreating] = useState(false),
    [reveal, setReveal] = useState(""),
    [trace, setTrace] = useState(""),
    command = useCommand();
  async function revoke(row: Row<Code>) {
    if (!confirm("撤销后二维码和激活码失效，并释放预留名额。继续吗？")) return;
    try {
      await api("/admin/activation-codes/" + row.id, { method: "DELETE" });
      await resource.reload();
      await changed();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <>
      <Records
        title="授权码"
        description={`新生成的码归属「${view.record.data.name}」。可按生成账号、激活用户编号、当时昵称或备注查询。`}
        footnote="生成时预留一个用户额度，激活后转为已使用；未激活的码撤销或过期后释放额度。生成者、激活用户及时间会保留，解绑不会删除历史记录。"
        controls={
          <label className="actions quiet">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => {
                setAll(e.target.checked);
                resource.setPage(1);
              }}
            />{" "}
            查看全部服务商的授权码
          </label>
        }
        resource={resource}
        actions={
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            生成授权码
          </button>
        }
        columns={[
          {
            title: "备注 / 尾号",
            render: (r) => (
              <>
                {r.data.label || "未备注"}
                <small className="cell-note">•••• {r.data.suffix}</small>
              </>
            ),
          },
          {
            title: "生成者 / 时间",
            render: (r) => (
              <>
                {r.data.creatorAccount ||
                  (r.data.actor ? "账号未记录 · " + r.data.actor : "未记录")}
                <small className="cell-note">{traceTime(r.createdAt)}</small>
              </>
            ),
          },
          {
            title: "状态",
            render: (r) =>
              r.data.status === "pending" &&
              Date.parse(r.data.expiresAt) <= Date.now() ? (
                "已过期，等待释放"
              ) : (
                <PartnerStatus state={r.data.status} />
              ),
          },
          {
            title: "归属服务商",
            render: (r) => (
              <PartnerIdentity
                id={r.data.partnerId}
                name={r.data.partnerName}
              />
            ),
          },
          { title: "有效期", render: (r) => date(r.data.expiresAt) },
          {
            title: "激活用户 / 时间",
            render: (r) => (
              <>
                {r.data.activatedNickname || r.data.userId || "尚未激活"}
                {r.data.userId && (
                  <>
                    <small className="cell-note">{r.data.userId}</small>
                    <small className="cell-note">
                      {traceTime(r.data.usedAt)} ·{" "}
                      {activationMethod(r.data.activationMethod)}
                    </small>
                  </>
                )}
              </>
            ),
          },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <div className="business-actions">
                <button onClick={() => setTrace(r.id)}>来源记录</button>
                {r.data.status === "pending" && (
                  <div className="business-actions">
                    <button onClick={() => setReveal(r.id)}>查看二维码</button>
                    <button onClick={() => void revoke(r)}>撤销</button>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
      <Memberships
        id={id}
        notify={notify}
        changed={async () => {
          await resource.reload();
          await changed();
        }}
      />
      {creating && (
        <Modal
          className="form-modal"
          title="生成授权码"
          onClose={() => !command.busy && setCreating(false)}
        >
          <form
            className="edit-form"
            aria-busy={command.busy}
            data-unsaved={command.busy || undefined}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const row = await command.send<Row<Code>>(
                  "/admin/activation-codes",
                  {
                    partnerId: id,
                    label: String(f.get("label")),
                    days: Number(f.get("days")),
                  },
                );
                setCreating(false);
                setReveal(row.id);
                await resource.reload();
                await changed();
              } catch (e) {
                notify((e as Error).message, "error");
              }
            }}
          >
            <div className="form-body">
              <fieldset disabled={command.busy}>
                <label>
                  备注
                  <input
                    name="label"
                    maxLength={80}
                    placeholder="便于区分使用对象"
                  />
                </label>
                <label>
                  激活码有效天数
                  <input
                    name="days"
                    type="number"
                    min="1"
                    max="30"
                    step="1"
                    defaultValue="7"
                    required
                  />
                </label>
                <p className="muted">
                  这里设置的是激活码领取期限。激活成功后长期绑定，停用仍占名额，解绑才释放。
                </p>
              </fieldset>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={command.busy}
                onClick={() => !command.busy && setCreating(false)}
              >
                取消
              </button>
              <button className="primary" disabled={command.busy}>
                生成并预留名额
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reveal && (
        <CodeReveal id={reveal} onClose={() => setReveal("")} notify={notify} />
      )}
      {trace && <ActivationTrace id={trace} onClose={() => setTrace("")} />}
    </>
  );
}
