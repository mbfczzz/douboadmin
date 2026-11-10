import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import Empty from "../components/Empty";
import type { Row } from "../api";
import Badge from "../components/Badge";
import ProviderId from "./ProviderId";
import ProviderActions, { type ProviderAction } from "./ProviderActions";
import type { Partner } from "./types";
import { roleName } from "../business/types";

type Item = Row<Partner>;
type Node = { item: Item; children: Node[] };
type Props = {
  rows: Item[];
  query: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
  open: (kind: ProviderAction, item: Item) => void;
  // Unset for provider logins: only the platform adds providers by hand.
  add?: (item: Item) => void;
};
const states: Record<string, [string, string]> = {
  active: ["已启用", "succeeded"],
  disabled: ["已停用", "failed"],
  pending: ["待开通", "queued"],
};

function buildTree(rows: Item[]) {
  const nodes = new Map<string, Node>(
      rows.map((item) => [item.id, { item, children: [] }]),
    ),
    roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.item.data.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: Node[]) => {
    items.sort((a, b) =>
      a.item.data.name.localeCompare(b.item.data.name, "zh-CN"),
    );
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function filterTree(nodes: Node[], query: string): Node[] {
  if (!query) return nodes;
  const value = query.toLowerCase();
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query),
      matched = [node.item.id, node.item.data.name].some((text) =>
        text.toLowerCase().includes(value),
      );
    return matched || children.length ? [{ ...node, children }] : [];
  });
}

function TreeNodes({
  nodes,
  depth,
  query,
  expanded,
  toggle,
  open: openDialog,
  add,
  rows,
}: Props & { nodes: Node[]; depth: number }) {
  return nodes.map(({ item: row, children }) => {
    const open = Boolean(query) || expanded.has(row.id),
      // Growth fails below a stopped provider; ancestors outside a login's
      // scope are active, or the login would not work.
      active = [...(row.data.path || []), row.id].every(
        (id) =>
          (rows.find((r) => r.id === id)?.data.status ?? "active") === "active",
      ),
      [state, tone] = states[row.data.status] || [row.data.status, "muted"],
      style = { "--tree-depth": depth } as CSSProperties;
    return (
      <div
        className="provider-tree-node"
        key={row.id}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={children.length ? open : undefined}
      >
        <div
          className={`provider-tree-row ${depth === 0 ? "root" : "child"}`}
          style={style}
        >
          <div className="provider-tree-name">
            {children.length ? (
              <button
                type="button"
                className="icon tree-toggle"
                aria-label={`${open ? "收起" : "展开"}${row.data.name}`}
                aria-expanded={open}
                onClick={() => toggle(row.id)}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <div className="provider-tree-identity">
              <b>{row.data.name}</b>
              <div className="provider-tree-detail quiet">
                <span>{roleName(row.data.role)} · </span>
                <ProviderId id={row.id} />
                {children.length > 0 && (
                  <span> · {children.length} 个下级</span>
                )}
                {row.data.ownerUser && <span> · 扫码加入</span>}
              </div>
            </div>
          </div>
          <div className="provider-tree-meta">
            <span>
              <small className="quiet">状态</small>
              <Badge state={tone} label={state} />
            </span>
          </div>
          <ProviderActions
            item={row}
            open={openDialog}
            add={active ? add : undefined}
          />
        </div>
        {children.length > 0 && open && (
          <div className="provider-tree-children" role="group" style={style}>
            <TreeNodes
              rows={rows}
              nodes={children}
              depth={depth + 1}
              query={query}
              expanded={expanded}
              toggle={toggle}
              open={openDialog}
              add={add}
            />
          </div>
        )}
      </div>
    );
  });
}

export default function ProviderTree(props: Props) {
  const tree = useMemo(() => buildTree(props.rows), [props.rows]),
    visible = useMemo(
      () => filterTree(tree, props.query.trim()),
      [tree, props.query],
    );
  return (
    <section
      className="panel provider-tree"
      role="tree"
      aria-label="服务商层级"
    >
      <div className="provider-tree-head quiet">
        <span>服务商</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      {visible.length ? (
        <TreeNodes
          {...props}
          nodes={visible}
          depth={0}
          query={props.query.trim()}
        />
      ) : (
        <Empty
          text={props.query ? "没有匹配的服务商" : "暂无服务商"}
          help={
            props.query
              ? "请调整搜索条件。"
              : "点击新增分公司创建第一个分公司。"
          }
        />
      )}
      <div className="provider-tree-count quiet">
        共 {props.rows.length} 个服务商
      </div>
    </section>
  );
}
