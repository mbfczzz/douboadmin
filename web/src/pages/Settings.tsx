import type { Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import PlatformForm from "../business/PlatformForm";
import type { Platform } from "../business/types";

export default function Settings({ notify }: PageProps) {
  const resource = useResource<{
    record: Row<Platform>;
    capabilities: Record<string, boolean>;
  }>("/admin/platform");
  return (
    <ResourcePage page="settings" resource={resource}>
      <div className="notice">
        <div>
          <b>服务配置</b>
          <p>
            微信支付：
            {resource.data?.capabilities.payment ? "已配置" : "待配置"} ·
            对象存储：{resource.data?.capabilities.oss ? "OSS" : "本地预览"}
          </p>
          <p>
            抖音接口：{resource.data?.capabilities.hot ? "已配置" : "待配置"} ·
            完成订阅通知：
            {resource.data?.capabilities.subscription ? "已配置" : "待配置"}
          </p>
          <p>
            连接凭证在服务端设置，更新后重启服务。积分规则和功能开关可在下方保存。
          </p>
        </div>
      </div>
      {resource.data && (
        <PlatformForm
          key={resource.data.record.version}
          row={resource.data.record}
          onSaved={resource.reload}
          notify={notify}
        />
      )}
    </ResourcePage>
  );
}
