import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import RequestState, { LoadingState } from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import ProviderForm from "./ProviderForm";
import ProviderTree from "./ProviderTree";
import type { PartnerTreeItem } from "./types";
import { available } from "./types";

const ProviderEditor = lazy(() => import("./ProviderEditor"));

export default function Providers({ notify }: { notify: Notify }) {
  const resource = useResource<PartnerTreeItem[]>(
      "/admin/partners/tree",
      15000,
    ),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [editing, setEditing] = useState<{
      parent: string;
      row?: PartnerTreeItem["record"];
      parentAvailable?: number;
    }>(),
    initialized = useRef(false);
  const rows = resource.data || [];
  const parentIds = useMemo(() => {
    const parents = new Set(rows.map((item) => item.record.data.parentId));
    return rows
      .filter((item) => parents.has(item.record.id))
      .map((item) => item.record.id);
  }, [rows]);
  const allOpen = parentIds.every((id) => expanded.has(id));
  useEffect(() => {
    if (initialized.current || !rows.length) return;
    setExpanded(new Set(parentIds));
    initialized.current = true;
  }, [rows, parentIds]);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <>
      <PageHeader
        page="partners"
        loading={resource.loading}
        onRefresh={() => void resource.reload()}
      >
        <button
          type="button"
          className="primary"
          onClick={() => setEditing({ parent: "root" })}
        >
          <Plus size={16} aria-hidden="true" />
          新增服务商
        </button>
      </PageHeader>
      <h2>服务商列表</h2>
      <form
        className="business-filters provider-toolbar"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          aria-label="搜索服务商"
          placeholder="搜索服务商名称或编号"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {parentIds.length > 0 && !query && (
          <button
            type="button"
            className="secondary"
            onClick={() => setExpanded(new Set(allOpen ? [] : parentIds))}
          >
            {allOpen ? "全部收起" : "全部展开"}
          </button>
        )}
      </form>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <ProviderTree
          rows={rows}
          query={query}
          expanded={expanded}
          toggle={toggle}
          edit={(item) =>
            setEditing({
              parent: item.record.data.parentId,
              row: item.record,
            })
          }
          add={(item) => {
            setExpanded((current) => new Set(current).add(item.record.id));
            setEditing({
              parent: item.record.id,
              parentAvailable: available(item.quota.users),
            });
          }}
        />
      )}
      {editing?.row ? (
        <Suspense fallback={<LoadingState label="正在加载服务商编辑" />}>
          <ProviderEditor
            row={editing.row}
            rows={rows}
            notify={notify}
            onClose={() => setEditing(undefined)}
            onSaved={resource.reload}
          />
        </Suspense>
      ) : editing ? (
        <ProviderForm
          parent={editing.parent}
          parentAvailable={editing.parentAvailable}
          onClose={() => setEditing(undefined)}
          notify={notify}
          onSaved={async () => {
            await resource.reload();
            setEditing(undefined);
          }}
        />
      ) : null}
    </>
  );
}
