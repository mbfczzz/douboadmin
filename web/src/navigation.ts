import {
  LayoutDashboard,
  Layers,
  Film,
  Users,
  SlidersHorizontal,
  MessageSquare,
  Settings2,
} from "lucide-react";
import type { Config } from "./api";
export const pageInfo = {
  overview: ["工作概览", "查看用户、生成任务与收支统计。", LayoutDashboard],
  templates: [
    "创作模板",
    "管理创作配方与展示效果，配置后上架到小程序。",
    Layers,
  ],
  jobs: ["生成任务", "查看任务进度、生成结果与失败原因。", Film],
  works: ["作品管理", "预览、管理作品与公开分享状态。", Film],
  reviews: ["内容审核", "审核作品内容，处理公开展示申请。", Layers],
  orders: ["充值订单", "查看真实支付状态、到账积分与退款。", LayoutDashboard],
  payments: [
    "支付管理",
    "查询支付流水、到账积分与退款记录。",
    SlidersHorizontal,
  ],
  music: ["背景音乐", "维护小程序混剪可选的音乐素材。", Film],
  monitor: ["运行监控", "查看节点、队列、错误日志和异常告警。", Settings2],
  users: ["用户管理", "管理用户资料、使用授权与积分。", Users],
  models: [
    "模型管理",
    "同步中转模型，管理可用能力与生成参数。",
    SlidersHorizontal,
  ],
  feedback: ["用户反馈", "查看用户提交的问题与建议。", MessageSquare],
  settings: ["系统设置", "部署状态与服务连接信息。", Settings2],
} as const;
export type PageId = keyof typeof pageInfo;
export const navGroups: { label: string; pages: PageId[] }[] = [
  {
    label: "内容与创作",
    pages: ["overview", "templates", "jobs", "works", "reviews", "music"],
  },
  { label: "用户与交易", pages: ["users", "orders", "payments"] },
  { label: "平台管理", pages: ["models", "monitor", "feedback", "settings"] },
];
export interface PageProps {
  config?: Config;
  notify: (message: string) => void;
  navigate: (page: PageId) => void;
}
