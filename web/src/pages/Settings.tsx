import type { Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import type { Platform } from "../business/types";
import IntegrationPanel from "../integrations/Panel";

export default function Settings({ notify }: PageProps) {
  const resource = useResource<{
    record: Row<Platform>;
    capabilities: Record<string, boolean>;
  }>("/admin/platform");
  return (
    <ResourcePage page="settings" resource={resource}>
      <IntegrationPanel
        notify={notify}
        capabilities={resource.data?.capabilities}
      />
    </ResourcePage>
  );
}
