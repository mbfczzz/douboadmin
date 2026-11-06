import { lazy, Suspense, useId, useMemo, useState } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import RequestState, { LoadingState } from "../components/RequestState";
import { canLeave } from "../hooks/unsaved";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import ProviderForm from "./ProviderForm";
import type { Overview, Partner, PartnerTreeItem, Scope } from "./types";
import { PartnerNames } from "./PartnerIdentity";
import ProviderId from "./ProviderId";

const Quotas = lazy(() => import("./Quotas")),
  Codes = lazy(() => import("./Codes")),
  Commissions = lazy(() => import("./Commissions"));

export default function ProviderEditor({
  row,
  rows,
  notify,
  onClose,
  onSaved,
}: {
  row: Row<Partner>;
  rows: PartnerTreeItem[];
  notify: Notify;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tab, setTab] = useState("basic"),
    resource = useResource<Overview>("/admin/partners/" + row.id, 15000),
    view = resource.data?.record.id === row.id ? resource.data : undefined;
  const panelId = useId();
  const names = useMemo(
    () => new Map(rows.map(({ record }) => [record.id, record.data.name])),
    [rows],
  );
  const changed = async () => {
    await Promise.all([resource.reload(), onSaved()]);
  };
  const scope: Scope | undefined = view
    ? { id: row.id, view, notify, changed }
    : undefined;
  return (
    <Modal
      title="编辑服务商"
      subtitle={
        <>
          {row.data.name} · <ProviderId id={row.id} />
        </>
      }
      className="partner-editor"
      style={{
        width: tab === "basic" ? "min(840px, 100%)" : "min(1180px, 100%)",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onClose={() => canLeave() && onClose()}
    >
      <PartnerNames.Provider value={names}>
        <div
          className="business-filters provider-editor-tabs"
          role="tablist"
          aria-label="服务商编辑模块"
          style={{ margin: 0, padding: "0 24px" }}
        >
          {[
            ["basic", "基本信息"],
            ["quotas", "名额划拨"],
            ["codes", "授权激活"],
            ["commissions", "算力分佣"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`${panelId}-${key}`}
              aria-controls={panelId}
              tabIndex={tab === key ? 0 : -1}
              aria-selected={tab === key}
              onKeyDown={(event) => {
                const keys = ["basic", "quotas", "codes", "commissions"];
                const index = keys.indexOf(key);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % 4
                    : event.key === "ArrowLeft"
                      ? (index + 3) % 4
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 3
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                if (!canLeave()) return;
                setTab(keys[next]);
                document.getElementById(`${panelId}-${keys[next]}`)?.focus();
              }}
              onClick={() => {
                if (key !== tab && canLeave()) setTab(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-${tab}`}
          tabIndex={0}
          style={{
            minHeight: 0,
            overflow: "auto",
            padding: tab === "basic" ? 0 : "20px 24px 24px",
          }}
        >
          {(resource.error || (resource.loading && !view)) && (
            <div className={tab === "basic" ? "edit-form" : undefined}>
              <RequestState
                loading={resource.loading && !view}
                error={resource.error}
                retry={resource.reload}
              />
            </div>
          )}
          {view && tab === "basic" && (
            <ProviderForm
              embedded
              parent={view.record.data.parentId}
              row={view.record}
              notify={notify}
              onClose={onClose}
              onSaved={onSaved}
            />
          )}
          {scope && tab !== "basic" && (
            <Suspense fallback={<LoadingState label="正在加载服务商功能" />}>
              {tab === "quotas" && <Quotas {...scope} />}
              {tab === "codes" && <Codes {...scope} />}
              {tab === "commissions" && <Commissions {...scope} />}
            </Suspense>
          )}
        </div>
      </PartnerNames.Provider>
    </Modal>
  );
}
