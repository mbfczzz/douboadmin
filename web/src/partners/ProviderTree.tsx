import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import Empty from "../components/Empty";
import ProviderId from "./ProviderId";
import type { PartnerTreeItem } from "./types";
import { available, labels } from "./types";

type Node = { item: PartnerTreeItem; children: Node[] };
type Props = {
  rows: PartnerTreeItem[];
  query: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
  edit: (item: PartnerTreeItem) => void;
  add: (item: PartnerTreeItem) => void;
};

function buildTree(rows: PartnerTreeItem[]) {
  const nodes = new Map<string, Node>(
      rows.map((item) => [item.record.id, { item, children: [] }]),
    ),
    roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.item.record.data.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: Node[]) => {
    items.sort((a, b) =>
      a.item.record.data.name.localeCompare(b.item.record.data.name, "zh-CN"),
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
      matched = [node.item.record.id, node.item.record.data.name].some((text) =>
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
  edit,
  add,
  rows,
}: Props & { nodes: Node[]; depth: number }) {
  return nodes.map(({ item, children }) => {
    const { record: row, quota } = item,
      open = Boolean(query) || expanded.has(row.id),
      free = available(quota.users),
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
                <ProviderId id={row.id} />
                {" "}
                {children.length > 0 && <span>{children.length} 个子级</span>}
              </div>
            </div>
          </div>
          <div className="provider-tree-meta">
            <span>
              <small className="quiet">状态</small>
              <span
                className={`badge ${row.data.status === "active" ? "succeeded" : "failed"}`}
              >
                <i aria-hidden="true" />
                {labels[row.data.status] || row.data.status}
              </span>
            </span>
            <span className="provider-quota">
              <small className="quiet">授权总额度</small>
              {quota.users.granted}
            </span>
            <span className="provider-quota">
              <small className="quiet">已用 / 下拨 / 可用</small>
              {quota.users.used} / {quota.users.allocated} / {free}
            </span>
          </div>
          <div className="provider-tree-actions">
            <button className="secondary" onClick={() => add(item)}>
              新增子级
            </button>
            <button className="secondary" onClick={() => edit(item)}>
              编辑
            </button>
          </div>
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
              edit={edit}
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
        <span className="provider-quota">授权总额度</span>
        <span className="provider-quota">已用 / 下拨 / 可用</span>
        <span className="provider-quota">操作</span>
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
              : "点击新增服务商创建第一个服务商。"
          }
        />
      )}
      <div className="provider-tree-count quiet">共 {props.rows.length} 个服务商</div>
    </section>
  );
}
