import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import Pagination from "../components/Pagination";
import Empty from "../components/Empty";
import Badge from "../components/Badge";
import type { Row } from "../api";
import type { Partner } from "./types";
import ProviderActions, { type ProviderAction } from "./ProviderActions";
import ProviderId from "./ProviderId";
import { roleName } from "../business/types";

export type ProviderItem = Row<Partner> & { children: number };
type Props = {
  query: string;
  refresh: number;
  open: (kind: ProviderAction, row: Row<Partner>) => void;
  parent?: string;
  depth?: number;
};
const states: Record<string, [string, string]> = {
  active: ["已启用", "succeeded"],
  disabled: ["已停用", "failed"],
  pending: ["待开通", "queued"],
};

function ProviderNode({ row, ...props }: Props & { row: ProviderItem }) {
  const [expanded, setExpanded] = useState(false);
  const depth = props.depth || 0;
  const [label, tone] = states[row.data.status] || [row.data.status, "muted"];
  const style = { "--tree-depth": depth } as CSSProperties;
  return (
    <div
      className="provider-tree-node"
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={row.children ? expanded : undefined}
    >
      <div
        className={`provider-tree-row ${depth === 0 ? "root" : "child"}`}
        style={style}
      >
        <div className="provider-tree-name">
          {row.children > 0 ? (
            <button
              className="icon tree-toggle"
              aria-label={`${expanded ? "收起" : "展开"}${row.data.name}`}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          ) : (
            <span className="tree-spacer" />
          )}
          <div className="provider-tree-identity">
            <b>{row.data.name}</b>
            <div className="provider-tree-detail quiet">
              <span>{roleName(row.data.role)} · </span>
              <ProviderId id={row.id} />
              {row.children > 0 && <span> · {row.children} 个下级</span>}
              {row.data.ownerUser && <span> · 扫码加入</span>}
            </div>
          </div>
        </div>
        <div className="provider-tree-meta">
          <span>
            <small className="quiet">状态</small>
            <Badge state={tone} label={label} />
          </span>
        </div>
        <ProviderActions item={row} open={props.open} />
      </div>
      {expanded && row.children > 0 && (
        <div className="provider-tree-children" role="group" style={style}>
          <PagedProviderTree
            {...props}
            parent={row.id}
            query=""
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}

export default function PagedProviderTree(props: Props) {
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    page: String(page),
    q: props.query,
    revision: String(props.refresh),
  });
  if (props.parent) params.set("parent", props.parent);
  const resource = useResource<{
    items: ProviderItem[];
    page: number;
    total: number;
    size?: number;
  }>(`/admin/partners/tree?${params}`);
  return (
    <>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <>
          {!resource.data.items.length && (
            <Empty text={props.query ? "没有匹配的服务商" : "暂无服务商"} />
          )}
          {resource.data.items.map((row) => (
            <ProviderNode key={row.id} {...props} row={row} />
          ))}
          {(!props.parent ||
            resource.data.total > (resource.data.size ?? 20) ||
            resource.data.page > 1) && (
            <Pagination
              page={resource.data.page}
              total={resource.data.total}
              size={resource.data.size}
              onChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}
