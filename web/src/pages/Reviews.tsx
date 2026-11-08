import { useState } from "react";
import { api, date, type Row, type Job } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import Modal from "../components/Modal";
import MediaPreview from "../business/MediaPreview";
import { statuses, type Review } from "../business/types";
import StatusBadge from "../components/StatusBadge";
type Item = { record: Row<Review>; job: Job };

export default function Reviews({ notify }: PageProps) {
  const resource = useResource<Item[]>("/admin/reviews"),
    [state, setState] = useRememberedState("reviews.status", "pending"),
    [detail, setDetail] = useState<Item | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  async function decide(status: string) {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await api(`/admin/reviews/${detail.job.id}`, {
        method: "PUT",
        body: JSON.stringify({
          version: detail.record.version,
          status,
          reason,
        }),
      });
      setDetail(null);
      await resource.reload();
      notify("审核结果已保存并通知用户");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourcePage page="reviews" resource={resource}>
      <div className="business-filters">
        <select
          aria-label="审核状态"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">全部</option>
          {["pending", "approved", "rejected"].map((s) => (
            <option key={s} value={s}>
              {statuses[s]}
            </option>
          ))}
        </select>
      </div>
      <Table
        key={state}
        rows={(resource.data || []).filter(
          (r) => !state || r.record.data.status === state,
        )}
        id={(r) => r.job.id}
        columns={[
          {
            title: "作品",
            render: (r) => r.job.input.prompt.slice(0, 36) || "混剪作品",
          },
          { title: "用户", render: (r) => r.job.userId },
          {
            title: "状态",
            render: (r) => <StatusBadge status={r.record.data.status} />,
          },
          { title: "原因", render: (r) => r.record.data.reason || "—" },
          { title: "提交时间", render: (r) => date(r.job.createdAt) },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <button
                onClick={() => {
                  setDetail(r);
                  setReason("");
                }}
              >
                查看并审核
              </button>
            ),
          },
        ]}
      />
      {detail && (
        <Modal title="作品审核" onClose={() => !busy && setDetail(null)}>
          <MediaPreview job={detail.job} />
          <div className="edit-form" style={{ paddingTop: 0 }}>
            <label>
              审核说明（驳回必填）
              <textarea
                disabled={busy}
                placeholder="驳回时必填；审核通过可留空"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary danger-text"
                disabled={busy || !reason.trim()}
                onClick={() => void decide("rejected")}
              >
                驳回
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void decide("approved")}
              >
                审核通过
              </button>
            </div>
          </div>
        </Modal>
      )}
    </ResourcePage>
  );
}
