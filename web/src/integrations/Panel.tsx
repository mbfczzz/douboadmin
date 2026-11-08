import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import type { Notify } from "../navigation";
import GroupForm from "./GroupForm";
import type { IntegrationState } from "./types";
import "./integrations.css";

export default function Panel({ notify }: { notify: Notify }) {
  const resource = useResource<IntegrationState>("/admin/integrations");
  const data = resource.data;
  return (
    <section>
      <h2>服务接入配置</h2>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {data && !data.available && (
        <p className="quiet">
          {data.canManage
            ? "接入配置未初始化。"
            : "仅超级管理员可修改接入配置。"}
        </p>
      )}
      {data?.available && (
        <>
          <p className="quiet">
            密钥加密保存，留空不改；保存后重启 API 和 Worker。
          </p>
          <p className="quiet">
            备份并共享密钥文件：<span className="mono">{data.keyFile}</span>
          </p>
          {data.groups?.map((group) => (
            <GroupForm
              key={group.id}
              group={group}
              reload={resource.reload}
              notify={notify}
            />
          ))}
        </>
      )}
    </section>
  );
}
