import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import { useState } from "react";
import { stateText, type Job } from "../api";
import FilterBar from "../components/FilterBar";
import Empty from "../components/Empty";
import JobTable from "../components/JobTable";
import JobDetail from "../components/JobDetail";
export default function Jobs() {
  const resource = useResource<Job[]>("/admin/jobs", 15000);
  const jobs = resource.data || [];
  const [filter, setFilter] = useRememberedState("jobs.status", "all"),
    [search, setSearch] = useRememberedState("jobs.query", ""),
    [detail, setDetail] = useState<Job | null>(null);
  const filteredJobs = jobs.filter(
    (j) =>
      (filter === "all" || j.status === filter) &&
      (j.input.prompt.includes(search) || j.id.includes(search)),
  );
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
          onChange={setFilter}
          search={search}
          onSearch={setSearch}
          placeholder="搜索提示词或任务编号"
        />
        {filteredJobs.length ? (
          <JobTable jobs={filteredJobs} onDetail={setDetail} />
        ) : !resource.data || resource.error ? null : (
          <Empty text="暂无匹配的任务" />
        )}
      </section>
      {detail && (
        <JobDetail
          detail={jobs.find((j) => j.id === detail.id) || detail}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
