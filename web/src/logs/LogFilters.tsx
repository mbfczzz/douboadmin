import { Search } from "lucide-react";
import DateField from "../components/DateField";
import type { LogTab } from "./types";

// One filter row per tab; submitting builds the query string.
export default function LogFilters({
  tab,
  actor = "",
  onSearch,
}: {
  tab: LogTab;
  actor?: string;
  onSearch: (query: string) => void;
}) {
  const points = tab === "points";
  return (
    <form
      className="business-filters log-filters"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        new FormData(e.currentTarget).forEach((value, key) => {
          const v = String(value).trim();
          if (!v) return;
          // "只看写操作" lives in the method list; the API takes writes=1.
          if (key === "method" && v === "writes") params.set("writes", "1");
          else params.set(key, v);
        });
        onSearch(params.toString());
      }}
      onReset={() => onSearch("")}
    >
      {points ? (
        <label>
          用户编号
          <input name="user" placeholder="小程序用户编号" maxLength={64} />
        </label>
      ) : (
        <label>
          {tab === "auth" ? "账号 / 用户" : "操作人"}
          <input
            name="actor"
            placeholder="名称或编号"
            maxLength={64}
            defaultValue={actor}
          />
        </label>
      )}
      {!points && tab !== "auth" && (
        <label>
          {tab === "model" ? "任务" : "操作对象"}
          <input name="target" placeholder="名称或编号" maxLength={64} />
        </label>
      )}
      <label className="filter-grow">
        关键词
        <input
          type="search"
          name="q"
          placeholder={
            points ? "原因、订单或任务编号" : "操作名称、摘要或接口路径"
          }
          maxLength={100}
        />
      </label>
      {!points && (
        <label>
          结果
          <select name="status" aria-label="结果">
            <option value="">全部</option>
            <option value="ok">成功</option>
            <option value="fail">失败</option>
          </select>
        </label>
      )}
      {tab === "api" && (
        <label>
          方法
          <select name="method" aria-label="请求方法">
            <option value="">全部</option>
            <option value="writes">只看写操作</option>
            {["GET", "POST", "PUT", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}
      {!points && (
        <div className="date-range">
          <span className="field-label">时间（北京时间）</span>
          <div>
            <DateField name="from" label="开始日期" />
            <span className="quiet">至</span>
            <DateField name="to" label="结束日期" />
          </div>
        </div>
      )}
      <div className="log-filter-actions">
        <button className="secondary" type="reset">
          重置
        </button>
        <button className="primary" type="submit">
          <Search size={15} aria-hidden="true" />
          查询
        </button>
      </div>
    </form>
  );
}
