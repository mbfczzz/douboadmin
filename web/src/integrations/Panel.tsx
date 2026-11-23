import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import type { Notify } from "../navigation";
import GroupForm from "./GroupForm";
import Overview from "./Overview";
import type { IntegrationState } from "./types";
import "./integrations.css";

export default function Panel({
  notify,
  capabilities,
}: {
  notify: Notify;
  capabilities?: Record<string, boolean>;
}) {
  const resource = useResource<IntegrationState>("/admin/integrations");
  const data = resource.data;
  return (
    <>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {data && !data.available && (
        <p className="notice">
          {data.canManage
            ? "接入配置未初始化。"
            : "仅超级管理员可修改接入配置。"}
        </p>
      )}
      {data?.available && data.groups && (
        <>
          <Overview groups={data.groups} capabilities={capabilities} />
          <section className="integration-list" aria-label="服务接入配置">
            <div className="integration-list-head">
              <h2>服务接入配置</h2>
              <p className="quiet">
                密钥加密保存，留空表示不修改；保存后需重启 API 和 Worker
                才生效。
              </p>
            </div>
            <p className="notice integration-key">
              <b>加密密钥文件</b>
              <span>
                多台服务器须共用同一文件，并与数据库一起备份：
                <span className="mono">{data.keyFile}</span>
              </span>
            </p>
            {data.groups.map((group) => (
              <GroupForm
                key={group.id}
                group={group}
                capabilities={capabilities}
                reload={resource.reload}
                notify={notify}
              />
            ))}
          </section>
        </>
      )}
    </>
  );
}
