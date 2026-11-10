import { lazy, Suspense, useMemo } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import RequestState, { LoadingState } from "../components/RequestState";
import { canLeave } from "../hooks/unsaved";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import type { Overview, Partner, Scope } from "./types";
import { PartnerNames } from "./PartnerIdentity";
import ProviderId from "./ProviderId";
import "./editor.css";

const ShareCode = lazy(() => import("./ShareCode")),
  Commissions = lazy(() => import("./Commissions")),
  Registrations = lazy(() => import("../users/Registrations"));

export const modules = {
  share: "分享码",
  commissions: "算力分佣",
  registrations: "会员开通",
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
  rows: Row<Partner>[];
  notify: Notify;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const resource = useResource<Overview>("/admin/partners/" + row.id, 15000),
    view = resource.data?.record.id === row.id ? resource.data : undefined;
  const names = useMemo(
    () => new Map(rows.map((r) => [r.id, r.data.name])),
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
      style={{
        width: "min(1040px, 100%)",
        height: kind === "commissions" ? undefined : "92vh",
      }}
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
              {kind === "share" && <ShareCode {...scope} />}
              {kind === "commissions" && <Commissions {...scope} />}
              {kind === "registrations" && (
                <Registrations
                  notify={notify}
                  refresh={0}
                  path={`/admin/partners/${encodeURIComponent(row.id)}/member-registrations`}
                  changed={scope.changed}
                />
              )}
            </Suspense>
          )}
        </div>
      </PartnerNames.Provider>
    </Modal>
  );
}
