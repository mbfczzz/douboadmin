import { Image, Bot, Film, Music, ArrowUpRight } from "lucide-react";
import { date, kindText, type Job } from "../api";
import Badge from "./Badge";
import { releasable, resumable } from "./JobRecovery";

export type JobAction = "detail" | "resume" | "release";
export default function JobTable({
  jobs,
  onAction,
}: {
  jobs: Job[];
  onAction: (kind: JobAction, j: Job) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="catalog-table">
        <thead>
          <tr>
            <th>创作内容</th>
            <th className="wide-only">类型</th>
            <th>状态</th>
            <th className="wide-only">创建时间</th>
            <th className="table-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>
                <div className="task-name">
                  <span className="task-icon">
                    {j.input.kind === "image" ? (
                      <Image size={18} />
                    ) : j.input.kind === "chat" ? (
                      <Bot size={18} />
                    ) : j.input.kind === "audio" ? (
                      <Music size={18} />
                    ) : (
                      <Film size={18} />
                    )}
                  </span>
                  <div>
                    <b title={j.input.prompt}>{j.input.prompt}</b>
                    <small>{j.id.slice(0, 12)}</small>
                  </div>
                </div>
              </td>
              <td className="wide-only">{kindText[j.input.kind]}</td>
              <td>
                <Badge state={j.status} />
              </td>
              <td className="wide-only">{date(j.createdAt)}</td>
              <td className="table-actions">
                <div className="business-actions">
                  <button
                    className="text-button"
                    onClick={() => onAction("detail", j)}
                  >
                    详情 <ArrowUpRight size={14} />
                  </button>
                  {resumable(j) && (
                    <button
                      className="text-button"
                      onClick={() => onAction("resume", j)}
                    >
                      恢复查询
                    </button>
                  )}
                  {releasable(j) && (
                    <button
                      className="text-button danger-text"
                      onClick={() => onAction("release", j)}
                    >
                      退回积分
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
