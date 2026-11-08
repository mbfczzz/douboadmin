import {
  LayoutDashboard,
  Layers,
  Film,
  Image,
  ShieldCheck,
  Users,
  Handshake,
  ReceiptText,
  CreditCard,
  UserCog,
  Bot,
  Activity,
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
  works: ["作品管理", "预览、管理作品与公开分享状态。", Image],
  reviews: ["内容审核", "审核作品内容，处理公开展示申请。", ShieldCheck],
  orders: ["充值订单", "查看真实支付状态、到账积分与退款。", ReceiptText],
  payments: ["支付管理", "查询支付流水、到账积分与退款记录。", CreditCard],
  monitor: ["运行监控", "查看节点、队列、错误日志和异常告警。", Activity],
  users: ["小程序用户", "管理微信用户资料、使用授权与积分。", Users],
  partners: [
    "服务商管理",
    "管理服务商层级、授权名额、激活码与算力分佣。",
    Handshake,
  ],
  accounts: ["管理账号", "管理后台登录账号、角色与启停状态。", UserCog],
  models: ["模型管理", "同步中转模型，管理可用能力与生成参数。", Bot],
  feedback: ["用户反馈", "查看用户提交的问题与建议。", MessageSquare],
  settings: ["系统设置", "部署状态与服务连接信息。", Settings2],
} as const;
export type PageId = keyof typeof pageInfo;
export type NoticeTone = "success" | "error" | "warning";
export type Notify = (message: string, tone?: NoticeTone) => void;
export const navGroups: { label: string; pages: PageId[] }[] = [
  {
    label: "内容与创作",
    pages: ["overview", "templates", "jobs", "works", "reviews"],
  },
  {
    label: "用户与交易",
    pages: ["users", "partners", "orders", "payments"],
  },
  {
    label: "平台管理",
    pages: ["accounts", "models", "monitor", "feedback", "settings"],
  },
];
export interface PageProps {
  config?: Config;
  notify: Notify;
  navigate: (page: PageId) => void;
}
