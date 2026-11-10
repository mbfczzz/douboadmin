import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import RequestState, { LoadingState } from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import ProviderForm from "./ProviderForm";
import ProviderTree from "./ProviderTree";
import type { Row } from "../api";
import type { Partner } from "./types";
import { useMe } from "../session";

import ProviderAccount from "./ProviderAccount";
import PlatformActions from "./PlatformActions";
import ProviderSelf from "./ProviderSelf";
import Modal from "../components/Modal";
import type { ProviderAction } from "./ProviderActions";

const ProviderModule = lazy(() => import("./ProviderModule"));

export default function Providers({ notify }: { notify: Notify }) {
  const resource = useResource<Row<Partner>[]>("/admin/partners/tree", 15000),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    // New provider under a parent (create form) or one row action.
    [creating, setCreating] = useState<Row<Partner> | "root">(),
    [action, setAction] = useState<{
      kind: ProviderAction;
      row: Row<Partner>;
    }>(),
    initialized = useRef(false);
  const rows = resource.data || [];
  // Only the platform adds providers by hand; provider logins grow by codes.
  const platform = !useMe()?.partnerId;
  const parentIds = useMemo(() => {
    const parents = new Set(rows.map((item) => item.data.parentId));
    return rows.filter((item) => parents.has(item.id)).map((item) => item.id);
  }, [rows]);
  const allOpen = parentIds.every((id) => expanded.has(id));
  useEffect(() => {
    if (initialized.current || !rows.length) return;
    setExpanded(new Set(parentIds));
    initialized.current = true;
  }, [rows, parentIds]);
  const close = () => setAction(undefined),
    kind = action?.kind,
    moduleKind = kind === "share" || kind === "commissions" ? kind : undefined;
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
        {platform && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating("root")}
          >
            <Plus size={16} aria-hidden="true" />
            新增分公司
          </button>
        )}
      </PageHeader>
      <h2>服务商列表</h2>
      {/* Not a <form>: the platform dialogs opened from here contain forms. */}
      <div className="business-filters provider-toolbar" role="search">
        <input
          type="search"
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
        {platform && (
          <span className="provider-platform">
            <PlatformActions notify={notify} changed={resource.reload} />
          </span>
        )}
      </div>
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
          open={(kind, row) => setAction({ kind, row })}
          add={
            platform
              ? (row) => {
                  setExpanded((current) => new Set(current).add(row.id));
                  setCreating(row);
                }
              : undefined
          }
        />
      )}
      {creating && (
        <ProviderForm
          parent={creating}
          onClose={() => setCreating(undefined)}
          notify={notify}
          onSaved={async () => {
            await resource.reload();
            setCreating(undefined);
          }}
        />
      )}
      {action?.kind === "edit" && (
        <ProviderForm
          row={action.row}
          onClose={close}
          notify={notify}
          onSaved={resource.reload}
        />
      )}
      {action?.kind === "account" && (
        <ProviderAccount row={action.row} notify={notify} onClose={close} />
      )}
      {action?.kind === "profile" && (
        <Modal
          className="form-modal"
          title="本服务商资料"
          subtitle={action.row.data.name}
          onClose={close}
        >
          <ProviderSelf partner={action.row.data} />
        </Modal>
      )}
      {action && moduleKind && (
        <Suspense fallback={<LoadingState label="正在加载服务商功能" />}>
          <ProviderModule
            kind={moduleKind}
            row={action.row}
            rows={rows}
            notify={notify}
            onClose={close}
            onSaved={resource.reload}
          />
        </Suspense>
      )}
    </>
  );
}
