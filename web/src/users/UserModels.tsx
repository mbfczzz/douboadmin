import { lazy, Suspense, useState } from "react";
import type { Row } from "../api";
import { useResource } from "../hooks/useResource";
import { useMe } from "../session";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import Empty from "../components/Empty";
import { points, type Profile } from "../business/types";
import { pct } from "../overview/format";
import RecordsHead from "./RecordsHead";
import ModelUsage from "./ModelUsage";
import RecentJobs from "./RecentJobs";
import Pagination from "../components/Pagination";
import type { ModelRecords } from "./records";
import "./records.css";
import "./model-records.css";

// The full generation record loads when a task is opened.
const GenerationDetail = lazy(() => import("../generation/GenerationDetail"));

// Which models a user generated with: totals, per-model outcomes and the
// latest tasks; each task opens the full generation record.
export default function UserModels({
  user,
  onClose,
}: {
  user: Row<Profile>;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const data = useResource<ModelRecords>(
      `/admin/users/${encodeURIComponent(user.id)}/models?page=${page}`,
    ),
    [open, setOpen] = useState(""),
    // Full generation records keep the 生成任务 menu.
    canJobs = !!useMe()?.menus.includes("jobs"),
    d = data.data,
    models = d?.models || [],
    sum = (pick: (m: (typeof models)[number]) => number) =>
      models.reduce((a, m) => a + pick(m), 0),
    calls = sum((m) => m.calls),
    finished = sum((m) => m.succeeded + m.failed);
  const tiles: [string, string, string][] = [
    ["使用模型", String(models.length), "个"],
    ["生成次数", String(calls), "次"],
    [
      "成功率",
      finished
        ? pct(
            sum((m) => m.succeeded),
            finished,
          )
        : "—",
      "",
    ],
    ["实际扣除", points(sum((m) => m.pointsUnits)), "积分"],
  ];
  return (
    <Modal
      title="模型使用记录"
      onClose={onClose}
      style={{ width: "min(920px, 100%)" }}
    >
      <div className="edit-form user-records">
        <RecordsHead user={user} />
        <RequestState
          loading={data.loading && !d}
          error={data.error}
          retry={data.reload}
        />
        {d && !models.length && (
          <Empty
            text="该用户还没有使用过模型"
            help="用户发起图片或视频生成后，这里会按模型统计调用次数和积分消耗。"
          />
        )}
        {d && models.length > 0 && (
          <>
            <dl className="records-stats">
              {tiles.map(([label, value, unit]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value}
                    {unit && <small>{unit}</small>}
                  </dd>
                </div>
              ))}
            </dl>
            {d.limited && (
              <p className="quiet records-note">
                统计范围为最近 200
                个任务；积分只计实际扣除，预留和已退回的不计入。
              </p>
            )}
            <section aria-label="按模型">
              <h3 className="records-title">按模型</h3>
              <ModelUsage models={models} />
            </section>
            <section aria-label="最近生成">
              <h3 className="records-title">
                最近生成
                <span className="quiet">共 {d.total} 条</span>
              </h3>
              <RecentJobs
                jobs={d.jobs}
                onOpen={canJobs ? setOpen : undefined}
              />
              <Pagination
                page={d.page}
                size={d.size}
                total={d.total}
                onChange={setPage}
              />
            </section>
          </>
        )}
      </div>
      {open && (
        <Suspense fallback={null}>
          <GenerationDetail
            path={`/admin/users/${encodeURIComponent(user.id)}/jobs/${encodeURIComponent(open)}`}
            onClose={() => setOpen("")}
          />
        </Suspense>
      )}
    </Modal>
  );
}
