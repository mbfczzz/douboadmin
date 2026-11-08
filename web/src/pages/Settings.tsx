import type { Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import type { Platform } from "../business/types";
import IntegrationPanel from "../integrations/Panel";

const services = [
  ["payment", "微信支付", "已配置", "未配置"],
  ["oss", "阿里云 OSS", "已配置", "未配置"],
  ["hot", "抖音接口", "已配置", "未配置"],
  ["subscription", "完成订阅通知", "已配置", "未配置"],
] as const;

export default function Settings({ notify }: PageProps) {
  const resource = useResource<{
    record: Row<Platform>;
    capabilities: Record<string, boolean>;
  }>("/admin/platform");
  return (
    <ResourcePage page="settings" resource={resource}>
      <section className="notice service-config" aria-label="服务配置">
        <div>
          <b>服务配置</b>
          <p>
            接入地址和密钥可在下方保存到数据库；数据库、Redis及监听端口由服务器启动配置管理。
          </p>
        </div>
        <ul>
          {services.map(([key, label, ready, idle]) => {
            const value = resource.data?.capabilities[key];
            return (
              <li key={key}>
                <span>{label}</span>
                <span
                  className={value ? "monitor-status online" : "monitor-status"}
                >
                  {value === undefined ? "未读取" : value ? ready : idle}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <IntegrationPanel notify={notify} />
    </ResourcePage>
  );
}
