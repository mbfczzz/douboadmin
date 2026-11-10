import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import { useRecordPage } from "../hooks/useRecordPage";
import { useState } from "react";
import Pagination from "../components/Pagination";
import { MessageSquare } from "lucide-react";
import { date, type Row } from "../api";
import Empty from "../components/Empty";
import "../styles/feedback-list.css";
export default function Feedback() {
  const [page, setPage] = useState(1);
  const resource = useRecordPage<Row["data"]>("/admin/feedback", page);
  const feedback = resource.data?.items || [];
  return (
    <>
      <PageHeader
        page="feedback"
        loading={resource.loading}
        onRefresh={resource.reload}
      />
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      <section className="panel">
        <div className="section-head">
          <h2>反馈记录</h2>
        </div>
        {feedback.length ? (
          <div className="feedback-list">
            {feedback.map((f) => (
              <article key={f.id}>
                <span className="avatar">
                  <MessageSquare size={18} />
                </span>
                <div>
                  <p>{String(f.data.content)}</p>
                  <small>
                    {f.owner} · {date(f.createdAt)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : !resource.data || resource.error ? null : (
          <Empty
            text="暂时没有反馈"
            help="小程序「帮助与反馈」提交的内容会显示在这里。"
          />
        )}
      </section>
      <Pagination
        total={resource.data?.total || 0}
        page={page}
        onChange={setPage}
      />
    </>
  );
}
