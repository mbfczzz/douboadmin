import { Image, Bot, Film, ArrowUpRight } from "lucide-react";
import { date, kindText, type Job } from "../api";
import Badge from "./Badge";
export default function JobTable({
  jobs,
  onDetail,
}: {
  jobs: Job[];
  onDetail: (j: Job) => void;
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
                    ) : (
                      <Film size={18} />
                    )}
                  </span>
                  <div>
                    <b>
                      {j.input.prompt.slice(0, 32)}
                      {j.input.prompt.length > 32 ? "…" : ""}
                    </b>
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
                <button className="text-button" onClick={() => onDetail(j)}>
                  详情 <ArrowUpRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
