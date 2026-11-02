import { useState } from "react";
import { api, date, type Job } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import Modal from "../components/Modal";
import MediaPreview from "../business/MediaPreview";

export default function Works({ notify }: PageProps) {
  const resource = useResource<Job[]>("/admin/works"),
    [detail, setDetail] = useState<Job | null>(null),
    [query, setQuery] = useState("");
  const rows = (resource.data || []).filter(
    (j) => j.input.prompt.includes(query) || j.userId.includes(query),
  );
  async function remove(j: Job) {
    if (
      !confirm(
        "删除后作品不再展示，分享链接会失效，订单与积分记录保留。继续吗？",
      )
    )
      return;
    try {
      await api("/admin/works/" + j.id, { method: "DELETE" });
      await resource.reload();
      notify("作品已删除");
    } catch (e) {
      notify((e as Error).message);
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
      </div>
      <Table
        key={query}
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
          { title: "用户", render: (j) => j.userId },
          {
            title: "审核",
            render: (j) =>
              j.reviewStatus === "approved"
                ? "已通过"
                : j.reviewStatus === "rejected"
                  ? "未通过"
                  : "待审核",
          },
          { title: "状态", render: (j) => (j.deleted ? "已删除" : "正常") },
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
