import PageHeader from "../components/PageHeader";
import CatalogResults from "../components/CatalogResults";
import { useCachedResource } from "../hooks/useCachedResource";
import { useRememberedState } from "../hooks/useRememberedState";
import { lazy, Suspense, useState } from "react";
import { stateText, type Job, type Model, type Row } from "../api";
import FilterBar from "../components/FilterBar";
import Empty from "../components/Empty";
import JobTable, { type JobAction } from "../components/JobTable";
import { releaseJob } from "../components/JobRecovery";
import type { PageProps } from "../navigation";
import JobFilters, {
  jobDates,
  type JobKind,
  type JobPeriod,
} from "../generation/JobFilters";
import "./jobs.css";

// The detail view loads when a task is opened.
const GenerationDetail = lazy(() => import("../generation/GenerationDetail"));
export default function Jobs({ notify }: PageProps) {
  const [filter, setFilter] = useRememberedState("jobs.status", "all"),
    [search, setSearch] = useRememberedState("jobs.query", ""),
    [period, setPeriod] = useRememberedState<JobPeriod>("jobs.period", "all"),
    [kind, setKind] = useRememberedState<JobKind>("jobs.kind", ""),
    [model, setModel] = useRememberedState("jobs.model", ""),
    [from, setFrom] = useRememberedState("jobs.from", ""),
    [to, setTo] = useRememberedState("jobs.to", ""),
    [detail, setDetail] = useState<Job | null>(null);
  const [page, setPage] = useState(1),
    [refreshKey, setRefreshKey] = useState(0);
  const dates = jobDates(period, from, to),
    query = new URLSearchParams({
      page: String(page),
      status: filter === "all" ? "" : filter,
      q: search,
      kind,
      model,
      from: dates[0],
      to: dates[1],
    });
  const resource = useCachedResource<{
    items: Job[];
    total: number;
    page: number;
  }>(`/admin/jobs?${query}`, 15000);
  const modelResource = useCachedResource<Row<Model>[]>("/admin/models");
  const jobs = resource.data?.items || [];
  const refresh = () => {
    setRefreshKey((value) => value + 1);
    void resource.reload();
  };
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
  const hasFilters =
    filter !== "all" || search || kind || model || period !== "all";
  return (
    <div className="catalog-page jobs-page">
      <PageHeader page="jobs" loading={resource.loading} onRefresh={refresh} />
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
        <JobFilters
          period={period}
          kind={kind}
          model={model}
          from={from}
          to={to}
          models={modelResource.data || []}
          onPeriod={(value) => {
            setPeriod(value);
            setPage(1);
          }}
          onKind={(value) => {
            setKind(value);
            setModel("");
            setPage(1);
          }}
          onModel={(value) => {
            setModel(value);
            setPage(1);
          }}
          onFrom={(value) => {
            setFrom(value);
            setPage(1);
          }}
          onTo={(value) => {
            setTo(value);
            setPage(1);
          }}
        />
        <CatalogResults
          label="生成任务列表"
          loading={resource.loading && !resource.data && !resource.error}
          error={resource.error}
          retry={refresh}
        >
          {filteredJobs.length ? (
            <JobTable
              jobs={filteredJobs}
              refreshKey={refreshKey}
              pagination={{
                page,
                total: resource.data?.total || 0,
                onChange: setPage,
              }}
              onAction={(k, j) => void act(k, j)}
            />
          ) : !resource.data || resource.error ? null : (
            <Empty
              text={hasFilters ? "暂无匹配的任务" : "暂无生成任务"}
              help={
                hasFilters
                  ? "请调整状态、时间、模型或搜索条件。"
                  : "用户开始创作后，内容会显示在这里。"
              }
            />
          )}
        </CatalogResults>
      </section>
      {detail && (
        <Suspense fallback={null}>
          <GenerationDetail
            path={`/admin/jobs/${encodeURIComponent(detail.id)}/detail`}
            onClose={() => setDetail(null)}
            notify={notify}
          />
        </Suspense>
      )}
    </div>
  );
}
