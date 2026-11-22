import { Bot, CalendarRange } from "lucide-react";
import type { Model, Row } from "../api";
import DateField from "../components/DateField";

export type JobPeriod = "all" | "today" | "7d" | "30d" | "custom";

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
  model,
  from,
  to,
  models,
  onPeriod,
  onModel,
  onFrom,
  onTo,
}: {
  period: JobPeriod;
  model: string;
  from: string;
  to: string;
  models: Row<Model>[];
  onPeriod(value: JobPeriod): void;
  onModel(value: string): void;
  onFrom(value: string): void;
  onTo(value: string): void;
}) {
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
        <Bot size={16} aria-hidden="true" />
        <span>模型</span>
        <select
          aria-label="任务模型"
          value={model}
          onChange={(e) => onModel(e.target.value)}
        >
          <option value="">全部模型</option>
          {model &&
            models.length > 0 &&
            !models.some((row) => row.id === model) && (
              <option value={model}>已移除的模型</option>
            )}
          {models.map((row) => (
            <option key={row.id} value={row.id}>
              {row.data.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
