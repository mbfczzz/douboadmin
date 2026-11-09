import type { Tone } from "../components/Tag";

export interface LogEntry {
  id: string;
  at: string;
  category: string;
  action?: string;
  actorType: string;
  actorId?: string;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  method?: string;
  route?: string;
  path?: string;
  status: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  summary?: string;
  request?: string;
  response?: string;
  error?: string;
}

export interface LogPage {
  items: LogEntry[];
  next?: string;
}

export const logTabs = [
  ["business", "业务日志", "谁在什么时候对什么做了什么操作"],
  ["api", "接口日志", "每一次接口调用：参数、返回、状态与耗时"],
  ["model", "模型调用", "向上游中转提交生成与查询结果的每一次调用"],
  ["points", "积分变动", "每一笔积分的增减、预留与退回"],
  ["auth", "登录日志", "管理员与用户的登录、退出"],
] as const;
export type LogTab = (typeof logTabs)[number][0];

export const actorLabels: Record<string, [string, Tone]> = {
  admin: ["管理员", "accent"],
  provider: ["服务商", "info"],
  user: ["用户", "success"],
  guest: ["访客", "muted"],
  system: ["系统", "warning"],
};

export const targetLabels: Record<string, string> = {
  user: "用户",
  admin: "管理账号",
  partner: "服务商",
  model: "模型",
  template: "模板",
  role: "角色",
  job: "任务",
  order: "订单",
  refund: "退款单",
  code: "授权码",
  request: "名额申请",
  payout: "提现",
  event: "支付通知",
  alert: "告警",
  group: "配置分组",
  video: "热门视频",
};

export const methodTones: Record<string, Tone> = {
  GET: "muted",
  POST: "info",
  PUT: "warning",
  DELETE: "danger",
};

export const failed = (e: LogEntry) => e.status >= 400 || !!e.error;

// Pretty-prints a logged JSON body; other text is shown as it is.
export function pretty(text?: string) {
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
