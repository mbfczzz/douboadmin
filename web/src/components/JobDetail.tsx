import { date, type Job } from "../api";
import Modal from "./Modal";
import Badge from "./Badge";
import JobExecution from "./JobExecution";
export default function JobDetail({
  detail,
  onClose,
}: {
  detail: Job;
  onClose: () => void;
}) {
  return (
    <Modal title="任务详情" onClose={onClose}>
      <div className="job-detail">
        <div className="detail-status">
          <Badge state={detail.status} />
        </div>
        <h3>{detail.input.prompt}</h3>
        <dl>
          <dt>任务编号</dt>
          <dd className="mono">{detail.id}</dd>
          <dt>提交时间</dt>
          <dd>{date(detail.createdAt)}</dd>
          <dt>模型</dt>
          <dd>{detail.modelName || detail.input.model}</dd>
          <dt>参数</dt>
          <dd>
            {detail.input.resolution} · {detail.input.ratio} ·{" "}
            {detail.input.duration} 秒
          </dd>
          <dt>轮询 / 处理次数</dt>
          <dd>{detail.attempts}</dd>
        </dl>
        {detail.error && <div className="error">{detail.error}</div>}
        <JobExecution key={detail.id} job={detail} />
        {detail.result &&
          (detail.input.kind === "chat" ? (
            <pre>{detail.result}</pre>
          ) : detail.input.kind === "image" ? (
            <img className="result-image" src={detail.result} alt="生成结果" />
          ) : (
            <video controls src={detail.result} />
          ))}
      </div>
    </Modal>
  );
}
