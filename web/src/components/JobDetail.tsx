import { date, type Job } from "../api";
import Modal from "./Modal";
import Badge from "./Badge";
import Tag, { IdChip } from "./Tag";
import DetailCard, { Field } from "./DetailCard";
import { kindNames, points } from "../business/types";
import JobExecution, { useExecution } from "./JobExecution";
export default function JobDetail({
  detail,
  onClose,
}: {
  detail: Job;
  onClose: () => void;
}) {
  const execution = useExecution(detail.id);
  return (
    <Modal title="任务详情" onClose={onClose}>
      <div className="job-detail">
        <div className="detail-tags job-tags">
          <Badge state={detail.status} />
          <Tag tone="info">
            {kindNames[detail.input.kind] || detail.input.kind}
          </Tag>
          <Tag tone="accent">{detail.modelName || detail.input.model}</Tag>
        </div>
        <h3>{detail.input.prompt}</h3>
        <DetailCard title="任务信息">
          <Field label="任务编号">
            <IdChip>{detail.id}</IdChip>
          </Field>
          <Field label="用户">
            <IdChip>{detail.userId}</IdChip>
          </Field>
          <Field label="提交时间">{date(detail.createdAt)}</Field>
          <Field label="参数">
            <span className="detail-tags">
              {[
                detail.input.resolution,
                detail.input.ratio,
                detail.input.duration ? `${detail.input.duration} 秒` : "",
              ]
                .filter(Boolean)
                .map((p) => (
                  <Tag key={p}>{p}</Tag>
                ))}
            </span>
          </Field>
          <Field label="积分">
            <span className="amount">{points(detail.costUnits || 0)}</span>
          </Field>
          <Field label="轮询 / 处理次数">{detail.attempts}</Field>
        </DetailCard>
        {detail.error && <div className="error">{detail.error}</div>}
        <JobExecution execution={execution} />
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
