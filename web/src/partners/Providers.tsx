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
import { MAX_LEVELS } from "./ProviderTree";
import { useMe } from "../session";

import ProviderAccount from "./ProviderAccount";
import ProviderSelf from "./ProviderSelf";
import Modal from "../components/Modal";
import type { ProviderAction } from "./ProviderActions";

const ProviderModule = lazy(() => import("./ProviderModule"));

export default function Providers({ notify }: { notify: Notify }) {
  const resource = useResource<PartnerTreeItem[]>(
      "/admin/partners/tree",
      15000,
    ),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    // New provider (create form) or one row action on an existing provider.
    [creating, setCreating] = useState<{
      parent: string;
      parentAvailable?: number;
    }>(),
    [action, setAction] = useState<{
      kind: ProviderAction;
      row: PartnerTreeItem["record"];
    }>(),
    initialized = useRef(false);
  const rows = resource.data || [];
  // A provider login adds children under its own node, within the level limit.
  const ownId = useMe()?.partnerId,
    own = ownId ? rows.find((item) => item.record.id === ownId) : undefined,
    canAddTop =
      !ownId || (!!own && (own.record.data.path?.length || 0) < MAX_LEVELS);
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
  const close = () => setAction(undefined),
    kind = action?.kind,
    moduleKind =
      kind === "quotas" || kind === "codes" || kind === "commissions"
        ? kind
        : undefined;
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
        {canAddTop && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (own)
                setExpanded((current) => new Set(current).add(own.record.id));
              setCreating(
                own
                  ? {
                      parent: own.record.id,
                      parentAvailable: available(own.quota.users),
                    }
                  : { parent: "root" },
              );
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {own ? "新增下级服务商" : "新增服务商"}
          </button>
        )}
      </PageHeader>
      <h2>服务商列表</h2>
      <form
        className="business-filters provider-toolbar"
        onSubmit={(event) => event.preventDefault()}
      >
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
          open={(kind, item) => setAction({ kind, row: item.record })}
          add={(item) => {
            setExpanded((current) => new Set(current).add(item.record.id));
            setCreating({
              parent: item.record.id,
              parentAvailable: available(item.quota.users),
            });
          }}
        />
      )}
      {creating && (
        <ProviderForm
          parent={creating.parent}
          parentAvailable={creating.parentAvailable}
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
          parent={action.row.data.parentId}
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
