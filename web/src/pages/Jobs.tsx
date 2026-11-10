import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import { lazy, Suspense, useState } from "react";
import { stateText, type Job } from "../api";
import FilterBar from "../components/FilterBar";
import Empty from "../components/Empty";
import JobTable, { type JobAction } from "../components/JobTable";
import { releaseJob } from "../components/JobRecovery";
import type { PageProps } from "../navigation";

// The detail view loads when a task is opened.
const GenerationDetail = lazy(() => import("../generation/GenerationDetail"));
export default function Jobs({ notify }: PageProps) {
  const [filter, setFilter] = useRememberedState("jobs.status", "all"),
    [search, setSearch] = useRememberedState("jobs.query", ""),
    [detail, setDetail] = useState<Job | null>(null);
  const [page, setPage] = useState(1);
  const resource = useResource<{ items: Job[]; total: number; page: number }>(
    `/admin/jobs?page=${page}&status=${filter === "all" ? "" : filter}&q=${encodeURIComponent(search)}`,
    15000,
  );
  const jobs = resource.data?.items || [];
  const act = async (kind: JobAction, job: Job) => {
    if (kind === "detail") return setDetail(job);
    try {
      if (await releaseJob(job)) {
        notify("预留积分已退回，此任务不会再次扣费或恢复生成");
        void resource.reload();
      }
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };
  const filteredJobs = jobs;
  return (
    <>
      <PageHeader
        page="jobs"
        loading={resource.loading}
        onRefresh={resource.reload}
      />
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      <section className="panel">
        <FilterBar
          inside
          options={["all", "queued", "running", "succeeded", "failed"].map(
            (v) => [v, v === "all" ? "全部任务" : stateText[v]] as const,
          )}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="搜索提示词或任务编号"
        />
        {filteredJobs.length ? (
          <JobTable
            jobs={filteredJobs}
            pagination={{
              page,
              total: resource.data?.total || 0,
              onChange: setPage,
            }}
            onAction={(k, j) => void act(k, j)}
          />
        ) : !resource.data || resource.error ? null : (
          <Empty
            text={jobs.length ? "暂无匹配的任务" : "暂无生成任务"}
            help={
              jobs.length
                ? "请调整状态或搜索条件。"
                : "用户开始创作后，内容会显示在这里。"
            }
          />
        )}
      </section>
      {detail && (
        <Suspense fallback={null}>
          <GenerationDetail
            path={`/admin/jobs/${encodeURIComponent(detail.id)}/detail`}
            onClose={() => setDetail(null)}
          />
        </Suspense>
      )}
    </>
  );
}
