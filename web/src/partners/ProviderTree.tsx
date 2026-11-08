import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import Empty from "../components/Empty";
import ProviderId from "./ProviderId";
import ProviderQuota from "./ProviderQuota";
import type { PartnerTreeItem } from "./types";
import { labels } from "./types";

type Node = { item: PartnerTreeItem; children: Node[] };
// Matches the server rule: providers go at most three levels below the platform.
export const MAX_LEVELS = 3;
const levelNames = [
  "一级",
  "二级",
  "三级",
  "四级",
  "五级",
  "六级",
  "七级",
  "八级",
];
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
      level = Math.max(depth + 1, row.data.path?.length || 0),
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
          onClick={(event) => {
            // The whole row opens the editor; inner buttons keep their own action.
            if (!(event.target as HTMLElement).closest("button")) edit(item);
          }}
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
                <span>{levelNames[level - 1] || `${level}级`} · </span>
                <ProviderId id={row.id} />
                {children.length > 0 && (
                  <span> · {children.length} 个下级</span>
                )}
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
            <ProviderQuota pool={quota.users} />
          </div>
          <div className="provider-tree-actions">
            {level < MAX_LEVELS && (
              <button className="text-button subtle" onClick={() => add(item)}>
                <Plus size={14} aria-hidden="true" />
                新增子级
              </button>
            )}
            <button className="text-button" onClick={() => edit(item)}>
              <Pencil size={13} aria-hidden="true" />
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
        <span className="provider-quota">授权名额</span>
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
      <div className="provider-tree-count quiet">
        共 {props.rows.length} 个服务商
      </div>
    </section>
  );
}
