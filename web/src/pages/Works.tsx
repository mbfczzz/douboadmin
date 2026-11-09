import Badge from "../components/Badge";
import { useState } from "react";
import { api, date, type Job } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import Modal from "../components/Modal";
import MediaPreview from "../business/MediaPreview";
import { IdChip } from "../components/Tag";
import { ask } from "../confirm/ask";

export default function Works({ notify }: PageProps) {
  const resource = useResource<Job[]>("/admin/works"),
    [detail, setDetail] = useState<Job | null>(null),
    [query, setQuery] = useRememberedState("works.query", ""),
    [review, setReview] = useRememberedState("works.review", ""),
    [state, setState] = useRememberedState("works.state", "");
  const rows = (resource.data || []).filter(
    (j) =>
      (j.input.prompt.includes(query) || j.userId.includes(query)) &&
      (!review || (j.reviewStatus || "pending") === review) &&
      (!state || (state === "deleted") === !!j.deleted),
  );
  async function remove(j: Job) {
    const ok = await ask({
      title: "删除作品？",
      message: `「${j.input.prompt.slice(0, 40) || "混剪作品"}」删除后不再展示，分享链接会失效；订单与积分记录保留。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok === false) return;
    try {
      await api("/admin/works/" + j.id, { method: "DELETE" });
      await resource.reload();
      notify("作品已删除");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <ResourcePage page="works" resource={resource}>
      <div className="business-filters">
        <input
          type="search"
          aria-label="搜索作品"
          placeholder="搜索创作描述或用户编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="审核状态"
          value={review}
          onChange={(e) => setReview(e.target.value)}
        >
          <option value="">全部审核状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">未通过</option>
        </select>
        <select
          aria-label="作品状态"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">全部作品</option>
          <option value="active">正常</option>
          <option value="deleted">已删除</option>
        </select>
      </div>
      <Table
        key={query + review + state}
        rows={rows}
        empty={query ? "没有匹配的作品，请调整搜索条件" : "暂无作品"}
        id={(j) => j.id}
        columns={[
          {
            title: "作品",
            render: (j) => (
              <>
                <b>{j.input.prompt.slice(0, 30) || "混剪作品"}</b>
                <small className="cell-note">
                  {j.modelName || j.input.kind}
                </small>
              </>
            ),
          },
          { title: "用户", render: (j) => <IdChip>{j.userId}</IdChip> },
          {
            title: "审核",
            render: (j) =>
              j.reviewStatus === "approved" ? (
                <Badge state="succeeded" label="已通过" />
              ) : j.reviewStatus === "rejected" ? (
                <Badge state="failed" label="未通过" />
              ) : (
                <Badge state="queued" label="待审核" />
              ),
          },
          {
            title: "状态",
            render: (j) => (
              <Badge
                state={j.deleted ? "muted" : "succeeded"}
                label={j.deleted ? "已删除" : "正常"}
              />
            ),
          },
          { title: "时间", render: (j) => date(j.createdAt) },
          {
            title: "操作",
            action: true,
            render: (j) => (
              <div className="business-actions">
                <button onClick={() => setDetail(j)}>预览</button>
                <button
                  disabled={j.deleted}
                  className="danger-text"
                  onClick={() => void remove(j)}
                >
                  删除
                </button>
              </div>
            ),
          },
        ]}
      />
      {detail && (
        <Modal title="作品预览" onClose={() => setDetail(null)}>
          <MediaPreview job={detail} />
        </Modal>
      )}
    </ResourcePage>
  );
}
