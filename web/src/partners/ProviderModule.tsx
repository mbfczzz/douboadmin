import { lazy, Suspense, useMemo } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import RequestState, { LoadingState } from "../components/RequestState";
import { canLeave } from "../hooks/unsaved";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import type { Overview, Partner, PartnerTreeItem, Scope } from "./types";
import { PartnerNames } from "./PartnerIdentity";
import ProviderId from "./ProviderId";
import "./editor.css";

const Quotas = lazy(() => import("./Quotas")),
  Codes = lazy(() => import("./Codes")),
  Commissions = lazy(() => import("./Commissions"));

export const modules = {
  quotas: "名额划拨",
  codes: "授权激活",
  commissions: "算力分佣",
} as const;
export type ModuleKey = keyof typeof modules;

// One provider function per dialog, opened from its own row button.
export default function ProviderModule({
  kind,
  row,
  rows,
  notify,
  onClose,
  onSaved,
}: {
  kind: ModuleKey;
  row: Row<Partner>;
  rows: PartnerTreeItem[];
  notify: Notify;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const resource = useResource<Overview>("/admin/partners/" + row.id, 15000),
    view = resource.data?.record.id === row.id ? resource.data : undefined;
  const names = useMemo(
    () => new Map(rows.map(({ record }) => [record.id, record.data.name])),
    [rows],
  );
  const scope: Scope | undefined = view && {
    id: row.id,
    view,
    notify,
    changed: async () => {
      await Promise.all([resource.reload(), onSaved()]);
    },
  };
  return (
    <Modal
      title={modules[kind]}
      subtitle={
        <>
          {row.data.name} · <ProviderId id={row.id} />
        </>
      }
      className="partner-editor"
      style={{ width: "min(1040px, 100%)" }}
      onClose={() => void canLeave().then((ok) => ok && onClose())}
    >
      <PartnerNames.Provider value={names}>
        <div className="provider-panel">
          <RequestState
            loading={resource.loading && !view}
            error={resource.error}
            retry={resource.reload}
          />
          {scope && (
            <Suspense fallback={<LoadingState label="正在加载服务商功能" />}>
              {kind === "quotas" && <Quotas {...scope} />}
              {kind === "codes" && <Codes {...scope} />}
              {kind === "commissions" && <Commissions {...scope} />}
            </Suspense>
          )}
        </div>
      </PartnerNames.Provider>
    </Modal>
  );
}
