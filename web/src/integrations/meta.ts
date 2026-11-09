import {
  Bell,
  Bot,
  Cloud,
  CreditCard,
  Flame,
  Globe,
  MessageCircle,
  Siren,
  type LucideIcon,
} from "lucide-react";
import type { IntegrationGroup } from "./types";

// Display details per integration group; the schema itself comes from the API.
export const groupMeta: Record<
  string,
  { icon: LucideIcon; desc: string; capability?: string }
> = {
  wechat: { icon: MessageCircle, desc: "小程序登录与用户身份" },
  relay: { icon: Bot, desc: "AI 生成模型的上游服务" },
  oss: { icon: Cloud, desc: "图片、视频等媒体文件存储", capability: "oss" },
  virtual: {
    icon: CreditCard,
    desc: "积分充值通道与商品",
    capability: "payment",
  },
  hot: { icon: Flame, desc: "热门视频发现", capability: "hot" },
  notifications: {
    icon: Bell,
    desc: "生成完成的微信订阅消息",
    capability: "subscription",
  },
  site: { icon: Globe, desc: "分享页与回调使用的公开地址" },
  alerts: { icon: Siren, desc: "错误告警推送到外部渠道" },
};

// A group counts as configured when the platform reports the capability, or
// otherwise when any key or address has been filled in.
export function configured(
  group: IntegrationGroup,
  capabilities?: Record<string, boolean>,
) {
  const cap = groupMeta[group.id]?.capability;
  if (cap && capabilities && cap in capabilities) return !!capabilities[cap];
  return (
    Object.values(group.secrets || {}).some(Boolean) ||
    Object.values(group.values || {}).some(
      (v) => v !== "" && v !== "false" && v !== "[]",
    )
  );
}

export const sourceLabel = (group: IntegrationGroup) =>
  group.source === "database" ? "后台配置" : "服务器环境变量";
