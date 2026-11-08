import { useEffect, useState } from "react";
import { api, type Row } from "../api";
import Modal from "../components/Modal";
import { LoadingState } from "../components/RequestState";
import type { Notify } from "../navigation";
import Picker from "./Picker";
import type { Overview, Partner } from "./types";
import { available } from "./types";
import { useCommand } from "./useCommand";
import ProviderId from "./ProviderId";

export default function QuotaForm({
  view,
  request,
  onClose,
  onSaved,
  notify,
}: {
  view: Overview;
  request: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notify;
}) {
  const [target, setTarget] = useState<Row<Partner>>(),
    [targetView, setTargetView] = useState<Overview>(),
    [targetError, setTargetError] = useState(""),
    [targetRevision, setTargetRevision] = useState(0),
    [picking, setPicking] = useState(false),
    [kind, setKind] = useState("grant"),
    [users, setUsers] = useState(1),
    [error, setError] = useState(""),
    command = useCommand();
  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    setTargetView(undefined);
    setTargetError("");
    void api<Overview>(`/admin/partners/${target.id}`, {
      signal: controller.signal,
    })
      .then(setTargetView)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setTargetError((reason as Error).message);
      });
    return () => controller.abort();
  }, [target, targetRevision]);
  const sourceAvailable = available(view.quota.users),
    targetAvailable = targetView ? available(targetView.quota.users) : 0,
    limit = kind === "grant" ? sourceAvailable : targetAvailable,
    amountValid = Number.isInteger(users) && users > 0 && users <= limit,
    targetAfter =
      kind === "grant" ? targetAvailable + users : targetAvailable - users,
    sourceAfter =
      kind === "grant" ? sourceAvailable - users : sourceAvailable + users;
  async function submit(form: HTMLFormElement) {
    const reason = String(new FormData(form).get("reason") || "").trim();
    setError("");
    if (!request && !target) return setError("请选择直接下级服务商");
    if (!request && !targetView) return setError("请等待目标额度读取完成");
    if (!Number.isInteger(users) || users < 1)
      return setError("用户额度必须是大于 0 的整数");
    if (!request && users > limit)
      return setError(
        `本次最多可${kind === "grant" ? "划拨" : "收回"} ${limit} 个名额`,
      );
    if (reason.length < 2) return setError("请填写至少 2 个字的操作原因");
    if (
      !request &&
      kind === "reclaim" &&
      !confirm(
        `确认从「${target!.data.name}」收回 ${users} 个可用名额？收回后该服务商剩余 ${targetAfter} 个可用名额。`,
      )
    )
      return;
    try {
      if (request)
        await command.send("/admin/quota-requests", {
          users,
          reason,
          partnerId: view.record.id,
        });
      else
        await command.send("/admin/quota-moves", {
          users,
          reason,
          parentId: view.record.id,
          childId: target!.id,
          kind,
        });
      await onSaved();
      onClose();
      notify(request ? "名额申请已提交" : "名额操作已保存");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <Modal
        className="form-modal"
        title={request ? "向上级申请名额" : "名额划拨 / 收回"}
        onClose={() => !command.busy && onClose()}
      >
        <form
          className="edit-form"
          aria-busy={command.busy}
          data-unsaved={command.busy || undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          <div className="form-body">
            <fieldset disabled={command.busy}>
              {!request && (
                <>
                  <p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setPicking(true)}
                    >
                      {target ? "更换下级服务商" : "选择直接下级服务商"}
                    </button>
                  </p>
                  {target && (
                    <div className="notice quota-target">
                      <div>
                        <b>{target.data.name}</b>
                        <p>来源：{view.record.data.name}</p>
                        <ProviderId id={target.id} />
                      </div>
                    </div>
                  )}
                  <label>
                    操作
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="grant">划拨给下级</option>
                      <option value="reclaim">收回下级可用名额</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                用户额度
                <input
                  name="users"
                  type="number"
                  min="1"
                  max={request ? 1000000 : Math.max(1, limit)}
                  step="1"
                  value={users}
                  onChange={(e) => setUsers(Number(e.target.value))}
                  required
                />
              </label>
              {!request && target && !targetView && !targetError && (
                <LoadingState label="正在读取目标额度" />
              )}
              {targetError && (
                <div className="error" role="alert">
                  {targetError}{" "}
                  <button
                    type="button"
                    onClick={() => setTargetRevision((value) => value + 1)}
                  >
                    重试
                  </button>
                </div>
              )}
              {!request && targetView && (
                <div className="business-metrics quota-preview">
                  <div className="panel">
                    <span>来源可用名额</span>
                    <strong>
                      {sourceAvailable} → {sourceAfter}
                    </strong>
                    <small>{view.record.data.name}</small>
                  </div>
                  <div className="panel">
                    <span>目标可用名额</span>
                    <strong>
                      {targetAvailable} → {targetAfter}
                    </strong>
                    <small>{target!.data.name}</small>
                  </div>
                </div>
              )}
              <p className="quiet">
                {request
                  ? "申请批准后才会增加当前服务商可用名额。"
                  : "已激活、已预留或继续划拨给更下级的额度不能收回。"}
              </p>
              <label>
                原因
                <textarea
                  name="reason"
                  minLength={2}
                  maxLength={200}
                  required
                />
              </label>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
            </fieldset>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={command.busy}
              onClick={() => !command.busy && onClose()}
            >
              取消
            </button>
            <button
              className={
                !request && kind === "reclaim" ? "primary danger" : "primary"
              }
              disabled={
                command.busy || (!request && (!targetView || !amountValid))
              }
            >
              {command.busy
                ? "处理中…"
                : request
                  ? "提交申请"
                  : kind === "reclaim"
                    ? `确认收回 ${users || 0} 个名额`
                    : `确认划拨 ${users || 0} 个名额`}
            </button>
          </div>
        </form>
      </Modal>
      {picking && (
        <Picker
          owner={view.record.id}
          onClose={() => setPicking(false)}
          onChoose={(_, row) => {
            if (row) setTarget(row);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
