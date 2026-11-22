import { Bot, CalendarRange, Layers } from "lucide-react";
import type { Model, Row } from "../api";
import DateField from "../components/DateField";

export type JobPeriod = "all" | "today" | "7d" | "30d" | "custom";
export type JobKind = "" | "image" | "video";

// Beijing-time day, as the server reads the from/to dates.
const beijingDay = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    Date.now() + offset * 86400000,
  );
const full = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "");
const spans: Partial<Record<JobPeriod, number>> = {
  today: 0,
  "7d": 6,
  "30d": 29,
};

// The from/to query dates for a period. A custom date still being typed is
// left out, and a reversed range is swapped, so the list never errors.
export function jobDates(period: JobPeriod, from: string, to: string) {
  const span = spans[period];
  if (span !== undefined) return [beijingDay(-span), beijingDay()];
  if (period !== "custom") return ["", ""];
  const a = full(from),
    b = full(to);
  return a && b && a > b ? [b, a] : [a, b];
}

export default function JobFilters({
  period,
  kind,
  model,
  from,
  to,
  models,
  onPeriod,
  onKind,
  onModel,
  onFrom,
  onTo,
}: {
  period: JobPeriod;
  kind: JobKind;
  model: string;
  from: string;
  to: string;
  models: Row<Model>[];
  onPeriod(value: JobPeriod): void;
  onKind(value: JobKind): void;
  onModel(value: string): void;
  onFrom(value: string): void;
  onTo(value: string): void;
}) {
  const visibleModels = models.filter((row) => !kind || row.data.kind === kind);
  const category = kind === "image" ? "图片" : kind === "video" ? "视频" : "";
  return (
    <div className="jobs-extra-filters" aria-label="任务筛选">
      <label>
        <CalendarRange size={16} aria-hidden="true" />
        <span>时间</span>
        <select
          aria-label="任务时间"
          value={period}
          onChange={(e) => onPeriod(e.target.value as JobPeriod)}
        >
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="7d">近 7 天</option>
          <option value="30d">近 30 天</option>
          <option value="custom">自定义</option>
        </select>
      </label>
      {period === "custom" && (
        <div className="jobs-date-range">
          <DateField
            name="jobs-from"
            label="任务开始日期"
            value={from}
            onChange={onFrom}
          />
          <span className="quiet">至</span>
          <DateField
            name="jobs-to"
            label="任务结束日期"
            value={to}
            onChange={onTo}
          />
        </div>
      )}
      <label>
        <Layers size={16} aria-hidden="true" />
        <span>分类</span>
        <select
          aria-label="任务分类"
          value={kind}
          onChange={(e) => onKind(e.target.value as JobKind)}
        >
          <option value="">全部分类</option>
          <option value="image">图片模型</option>
          <option value="video">视频模型</option>
        </select>
      </label>
      <label>
        <Bot size={16} aria-hidden="true" />
        <span>模型</span>
        <select
          aria-label="任务模型"
          value={model}
          onChange={(e) => onModel(e.target.value)}
        >
          <option value="">全部{category}模型</option>
          {model &&
            models.length > 0 &&
            !models.some((row) => row.id === model) && (
              <option value={model}>已移除的模型</option>
            )}
          {visibleModels.map((row) => (
            <option key={row.id} value={row.id}>
              {row.data.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
