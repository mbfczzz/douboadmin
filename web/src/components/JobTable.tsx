import { Image, Bot, Film, Music, ArrowUpRight } from "lucide-react";
import { date, kindText, type Job } from "../api";
import Badge from "./Badge";
import Table from "../business/Table";
import { releasable } from "./JobRecovery";

export type JobAction = "detail" | "release";
const icons = { image: Image, chat: Bot, audio: Music } as const;

// Shared record table: wraps text, and turns into cards when it cannot fit.
export default function JobTable({
  jobs,
  onAction,
  pagination,
}: {
  jobs: Job[];
  onAction: (kind: JobAction, j: Job) => void;
  pagination?: {
    page: number;
    total: number;
    onChange: (page: number) => void;
  };
}) {
  return (
    <Table
      rows={jobs}
      pagination={pagination}
      framed={false}
      id={(j) => j.id}
      columns={[
        {
          title: "创作内容",
          render: (j) => {
            const Icon = icons[j.input.kind as keyof typeof icons] || Film;
            return (
              <div className="task-name">
                <span className="task-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <b title={j.input.prompt}>{j.input.prompt}</b>
                  <small>{j.id.slice(0, 12)}</small>
                </div>
              </div>
            );
          },
        },
        { title: "类型", render: (j) => kindText[j.input.kind] },
        { title: "状态", render: (j) => <Badge state={j.status} /> },
        { title: "创建时间", render: (j) => date(j.createdAt) },
        {
          title: "操作",
          action: true,
          render: (j) => (
            <div className="business-actions">
              <button
                className="text-button"
                onClick={() => onAction("detail", j)}
              >
                详情 <ArrowUpRight size={14} />
              </button>
              {releasable(j) && (
                <button
                  className="text-button danger-text"
                  onClick={() => onAction("release", j)}
                >
                  退回积分
                </button>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
