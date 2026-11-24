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
import JobThumbnail from "../components/JobThumbnail";
import { ask } from "../confirm/ask";
import { Upload } from "lucide-react";
import WorkUpload from "../business/WorkUpload";

export default function Works({ notify, config }: PageProps) {
  const [detail, setDetail] = useState<Job | null>(null),
    [query, setQuery] = useRememberedState("works.query", ""),
    [state, setState] = useRememberedState("works.state", "");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(""),
    [uploading, setUploading] = useState(false);
  const resource = useResource<{ items: Job[]; total: number }>(
    `/admin/works?page=${page}&q=${encodeURIComponent(query)}&deleted=${state}`,
  );
  const rows = resource.data?.items || [];
  async function feature(j: Job) {
    if (busy) return;
    setBusy(j.id);
    try {
      const approved = await ask({
        title: j.featured ? "取消优秀作品？" : "设为优秀作品？",
        message: j.featured
          ? "取消后，小程序优秀作品展示页将不再显示这份作品。"
          : "作品的图片或视频将公开展示在小程序优秀作品页，请确认适合公开展示。用户编号、提示词和参考素材不会公开。",
        confirmText: j.featured ? "取消优秀" : "确认展示",
      });
      if (approved === false) return;
      await api(`/admin/works/${encodeURIComponent(j.id)}/featured`, {
        method: "PUT",
        confirmation: false,
        body: JSON.stringify({
          featured: !j.featured,
          version: j.workMetaVersion || 0,
        }),
      });
      await resource.reload();
      notify(j.featured ? "已取消优秀作品" : "已设为优秀作品");
    } catch (e) {
      notify((e as Error).message, "error");
      void resource.reload();
    } finally {
      setBusy("");
    }
  }
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
    <ResourcePage
      page="works"
      resource={resource}
      actions={
        // Only super admins receive config; the API enforces the same rule.
        config ? (
          <button className="primary" onClick={() => setUploading(true)}>
            <Upload size={16} />
            上传作品
          </button>
        ) : undefined
      }
    >
      <div className="business-filters">
        <input
          type="search"
          aria-label="搜索作品"
          placeholder="搜索创作描述或任务编号"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="作品状态"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部作品</option>
          <option value="active">正常</option>
          <option value="deleted">已删除</option>
        </select>
      </div>
      <Table
        key={query + state}
        rows={rows}
        pagination={{
          page,
          total: resource.data?.total || 0,
          onChange: setPage,
        }}
        empty={query ? "没有匹配的作品，请调整搜索条件" : "暂无作品"}
        id={(j) => j.id}
        columns={[
          {
            title: "作品",
            render: (j) => (
              <div className="task-name">
                <JobThumbnail job={j} />
                <div>
                  <b>
                    {(j.templateTitle || j.input.prompt).slice(0, 30) ||
                      "混剪作品"}
                  </b>
                  <small className="cell-note">
                    {j.modelName || j.input.kind}
                  </small>
                  {j.featured && <Badge state="succeeded" label="优秀作品" />}
                </div>
              </div>
            ),
          },
          { title: "用户名", render: (j) => j.userName || "—" },
          {
            title: "手机号",
            render: (j) => <span className="mono">{j.userPhone || "—"}</span>,
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
                  disabled={!!busy || j.deleted || (!j.featured && !j.result)}
                  onClick={() => void feature(j)}
                >
                  {j.featured ? "取消优秀" : "设为优秀"}
                </button>
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
      {uploading && (
        <WorkUpload
          onClose={() => setUploading(false)}
          onSaved={() => {
            setPage(1);
            return resource.reload();
          }}
          notify={notify}
        />
      )}
      {detail && (
        <Modal title="作品预览" onClose={() => setDetail(null)}>
          <MediaPreview job={detail} />
        </Modal>
      )}
    </ResourcePage>
  );
}
