import type { ReactNode } from "react";
import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import type { PageId } from "../navigation";
import { canLeave } from "../hooks/unsaved";
export default function ResourcePage({
  page,
  resource,
  actions,
  children,
}: {
  page: PageId;
  resource: {
    data?: unknown;
    loading: boolean;
    error: string;
    reload: () => unknown;
  };
  actions?: ReactNode;
  children: ReactNode;
}) {
  const refresh = () => {
    void canLeave().then((ok) => ok && resource.reload());
  };
  return (
    <div className="catalog-page">
      <PageHeader page={page} loading={resource.loading} onRefresh={refresh}>
        {actions}
      </PageHeader>
      <RequestState
        loading={resource.loading && resource.data === undefined}
        error={resource.error}
        retry={refresh}
      />
      {resource.data !== undefined && children}
    </div>
  );
}
