import { createContext, useContext } from "react";
import ProviderId from "./ProviderId";
import { labels } from "./types";

export const PartnerNames = createContext<ReadonlyMap<string, string>>(
  new Map(),
);

export function PartnerIdentity({ id, name }: { id: string; name?: string }) {
  const names = useContext(PartnerNames);
  if (id === "root") return <span>平台</span>;
  const label = name || names.get(id);
  return (
    <>
      {label && <span>{label}</span>}
      <span className="cell-note">
        <ProviderId id={id} />
      </span>
    </>
  );
}

export function PartnerStatus({ state }: { state: string }) {
  const tone = ["active", "approved", "paid", "used"].includes(state)
    ? "succeeded"
    : ["rejected", "disabled", "provider_disabled"].includes(state)
      ? "failed"
      : "";
  return (
    <span className={`badge ${tone}`}>
      <i aria-hidden="true" />
      {labels[state] || state}
    </span>
  );
}
