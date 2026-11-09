import { useState } from "react";
import { date, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import RequestState from "../components/RequestState";
import Tag from "../components/Tag";
import Empty from "../components/Empty";
import Table from "../business/Table";
import { kindNames, points, type Profile } from "../business/types";
import GenerationDetail from "../generation/GenerationDetail";
import "./records.css";

type ModelUse = {
  model: string;
  name: string;
  kind: string;
  calls: number;
  succeeded: number;
  failed: number;
  active: number;
  pointsUnits: number;
  lastAt: string;
};
type ModelJob = {
  id: string;
  model: string;
  name: string;
  kind: string;
  status: string;
  pointsUnits: number;
  prompt: string;
  error?: string;
  createdAt: string;
};

const modelName = (r: { name: string; model: string }) => (
  <>
    {r.name || r.model}
    {r.name && <small className="cell-note mono">{r.model}</small>}
  </>
);

// Which models a user generated with: totals per model, then recent tasks.
export default function UserModels({
  user,
  onClose,
}: {
  user: Row<Profile>;
  onClose: () => void;
}) {
  const data = useResource<{ models: ModelUse[]; jobs: ModelJob[] }>(
      `/admin/users/${user.id}/models`,
    ),
    models = data.data?.models || [],
    [open, setOpen] = useState(""),
    total = models.reduce(
      (a, m) => ({ calls: a.calls + m.calls, units: a.units + m.pointsUnits }),
      { calls: 0, units: 0 },
    );
  return (
    <Modal
      title="模型使用记录"
      subtitle={user.data.nickname || user.id}
      onClose={onClose}
      style={{ width: "min(960px, 100%)" }}
    >
      <div className="edit-form user-records">
        <RequestState
          loading={data.loading && !data.data}
          error={data.error}
          retry={data.reload}
        />
        {data.data && !models.length && (
          <Empty
            text="该用户还没有使用过模型"
            help="用户发起图片或视频生成后，这里会按模型统计调用次数和积分消耗。"
          />
        )}
        {data.data && models.length > 0 && (
          <>
            <p className="quiet records-summary">
              共使用 {models.length} 个模型 · 生成 {total.calls} 次 · 消耗{" "}
              {points(total.units)} 积分
            </p>
            <Table
              rows={models}
              id={(m) => m.model}
              paged={false}
              columns={[
                { title: "模型", render: modelName },
                {
                  title: "类型",
                  render: (m) => <Tag>{kindNames[m.kind] || m.kind}</Tag>,
                },
                { title: "调用", render: (m) => m.calls },
                {
                  title: "成功 / 失败 / 进行中",
                  render: (m) => `${m.succeeded} / ${m.failed} / ${m.active}`,
                },
                { title: "消耗积分", render: (m) => points(m.pointsUnits) },
                { title: "最近使用", render: (m) => date(m.lastAt) },
              ]}
            />
            <h3 className="records-title">最近生成（最多 100 条）</h3>
            <Table
              rows={data.data.jobs}
              id={(j) => j.id}
              empty="暂无生成记录"
              columns={[
                { title: "时间", render: (j) => date(j.createdAt) },
                { title: "模型", render: modelName },
                {
                  title: "内容",
                  render: (j) => (
                    <>
                      <span className="records-prompt">{j.prompt || "—"}</span>
                      {j.error && (
                        <small className="cell-note danger-text">
                          {j.error}
                        </small>
                      )}
                    </>
                  ),
                },
                { title: "状态", render: (j) => <Badge state={j.status} /> },
                { title: "积分", render: (j) => points(j.pointsUnits) },
                {
                  title: "操作",
                  action: true,
                  render: (j) => (
                    <button onClick={() => setOpen(j.id)}>详情</button>
                  ),
                },
              ]}
            />
          </>
        )}
      </div>
      {open && (
        <GenerationDetail
          path={`/admin/users/${encodeURIComponent(user.id)}/jobs/${encodeURIComponent(open)}`}
          onClose={() => setOpen("")}
        />
      )}
    </Modal>
  );
}
