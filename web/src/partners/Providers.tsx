import { lazy, Suspense, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { LoadingState } from "../components/RequestState";
import type { Notify } from "../navigation";
import ProviderForm from "./ProviderForm";
import PagedProviderTree from "./PagedProviderTree";
import type { Row } from "../api";
import type { Partner } from "./types";
import { useMe } from "../session";

import ProviderAccount from "./ProviderAccount";
import PlatformActions from "./PlatformActions";
import ProviderSelf from "./ProviderSelf";
import Modal from "../components/Modal";
import type { ProviderAction } from "./ProviderActions";
import { useRegistrationDecision } from "../users/useRegistrationDecision";
import { useBusinessRoleNames } from "../roles/business";

const ProviderModule = lazy(() => import("./ProviderModule"));

export default function Providers({ notify }: { notify: Notify }) {
  const roleName = useBusinessRoleNames();
  const [refresh, setRefresh] = useState(0),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    [action, setAction] = useState<{
      kind: ProviderAction;
      row: Row<Partner>;
    }>();
  const reload = async () => setRefresh((n) => n + 1);
  const review = useRegistrationDecision(
    notify,
    reload,
    `${query}/${creating}/${action?.kind}/${action?.row.id}`,
  );
  const rows = action ? [action.row] : [];
  // Only the platform adds branches by hand. S1/S2 join through invite codes.
  const platform = !useMe()?.partnerId;
  const close = () => setAction(undefined),
    kind = action?.kind,
    moduleKind =
      kind === "share" || kind === "commissions" || kind === "registrations"
        ? kind
        : undefined;
  return (
    <>
      <PageHeader page="partners" onRefresh={() => void reload()}>
        {platform && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
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
        {platform && (
          <span className="provider-platform">
            <PlatformActions notify={notify} changed={reload} />
          </span>
        )}
      </div>
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
        <PagedProviderTree
          key={query}
          refresh={refresh}
          roleName={roleName}
          query={query}
          busy={review.busy}
          open={(kind, row) => {
            if (kind === "approve" || kind === "reject") {
              if (row.data.ownerUser)
                void review.decide(row.data.ownerUser, kind === "approve", {
                  partnerId: row.id,
                  role: row.data.role,
                });
            } else setAction({ kind, row });
          }}
        />
      </section>
      {creating && (
        <ProviderForm
          onClose={() => setCreating(false)}
          notify={notify}
          onSaved={async () => {
            await reload();
            setCreating(false);
          }}
        />
      )}
      {action?.kind === "edit" && (
        <ProviderForm
          row={action.row}
          onClose={close}
          notify={notify}
          onSaved={reload}
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
            onSaved={reload}
          />
        </Suspense>
      )}
    </>
  );
}
