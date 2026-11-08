import Badge from "../components/Badge";
import { useState } from "react";
import { date, type Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import UserDetails from "../business/UserDetails";
import type { Profile } from "../business/types";

export default function Users({ notify }: PageProps) {
  const resource = useResource<Row<Profile>[]>("/admin/users"),
    [query, setQuery] = useRememberedState("users.query", ""),
    [detail, setDetail] = useState<Row<Profile> | null>(null);
  const rows = (resource.data || []).filter((r) =>
    [r.id, r.data.nickname, r.data.name, r.data.phone].some((v) =>
      v?.includes(query),
    ),
  );
  return (
    <ResourcePage page="users" resource={resource}>
      <div className="business-filters">
        <input
          type="search"
          aria-label="搜索用户"
          placeholder="搜索昵称、姓名、手机号或编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Table
        key={query}
        rows={rows}
        empty={query ? "没有匹配的用户，请调整搜索条件" : "暂无用户"}
        id={(r) => r.id}
        columns={[
          {
            title: "小程序用户",
            render: (r) => (
              <>
                {r.data.nickname}
                <small className="cell-note mono">{r.id}</small>
              </>
            ),
          },
          {
            title: "姓名 / 手机号",
            render: (r) => (
              <>
                {r.data.name || "未填写"}
                <small className="cell-note">{r.data.phone || "未填写"}</small>
              </>
            ),
          },
          {
            title: "状态",
            render: (r) => (
              <Badge
                state={
                  r.data.archived
                    ? "muted"
                    : r.data.disabled
                      ? "failed"
                      : "succeeded"
                }
                label={
                  r.data.archived
                    ? "已归档"
                    : r.data.disabled
                      ? "已停用"
                      : "正常"
                }
              />
            ),
          },
          {
            title: "使用授权",
            render: (r) => (
              <>
                {r.data.access?.active
                  ? r.data.access.status === "direct"
                    ? "直接开通"
                    : "服务商激活"
                  : r.data.access?.message || "待激活"}
                <small className="cell-note">
                  {r.data.access?.partnerName}
                </small>
              </>
            ),
          },
          { title: "注册时间", render: (r) => date(r.createdAt) },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <button onClick={() => setDetail(r)}>详情 / 积分</button>
            ),
          },
        ]}
      />
      {detail && (
        <UserDetails
          user={detail}
          onClose={() => setDetail(null)}
          onSaved={resource.reload}
          notify={notify}
        />
      )}
    </ResourcePage>
  );
}
