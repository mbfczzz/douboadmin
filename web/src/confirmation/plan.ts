import type { ConfirmationOptions, ConfirmationPlan } from "./request";
import { isPlain, sameValue, valueFormats } from "./values";

const names: Record<string, string> = {
  integrations: "服务接入配置",
  models: "模型",
  templates: "模板",
  accounts: "管理账号",
  users: "用户资料",
  signup: "普通用户注册",
  partners: "服务商",
  memberships: "用户归属",
  "partner-policy": "分销规则",
  "commission-payouts": "结算记录",
  "quota-requests": "名额申请",
  "quota-moves": "名额分配",
  roles: "角色",
  jobs: "生成任务",
};
const labels: Record<string, string> = {
  name: "名称",
  title: "标题",
  phone: "手机号",
  role: "角色",
  disabled: "停用",
  published: "发布状态",
  available: "可用状态",
  password: "密码",
  nickname: "昵称",
  realName: "姓名",
  bio: "个人简介",
  points: "积分价格",
  sort: "排序",
  status: "状态",
  menus: "可见菜单",
  amountFen: "金额",
  reason: "原因",
  note: "备注",
  units: "积分变动（百分之一积分）",
  partnerId: "服务商",
  pointsUnits: "积分（百分之一积分）",
  productId: "商品 ID",
  enabled: "启用",
  prompt: "提示词",
  approve: "批准申请",
  reference: "打款流水号 / 原因",
  users: "用户额度",
  parentId: "上级服务商",
  childId: "下级服务商",
  kind: "类型",
  openSignup: "开放普通用户注册",
};
export function needsConfirmation(path: string, method: string, body: unknown) {
  if (!path.startsWith("/admin/")) return false;
  if (/^\/admin\/alerts\/[^/]+\/ack$/.test(path)) return false;
  if (method === "PUT" || method === "PATCH") {
    // A version-zero record is a creation; global settings still need approval.
    const v = body as { version?: number } | null;
    return !(
      v?.version === 0 && /^\/admin\/(models|templates)\/[^/]+$/.test(path)
    );
  }
  return (
    method === "POST" &&
    (/\/(wallet|refund|release|retry|review|sync)$/.test(path) ||
      /^\/admin\/(quota-moves|commission-payouts)$/.test(path))
  );
}
const secret = (key: string, options: ConfirmationOptions) =>
  /password|secret|token|app.?key|api.?key|access.?key|aes.?key|private.?key|^current$|^next$/i.test(
    key,
  ) || options.secrets?.includes(key);
function safe(
  value: unknown,
  key: string,
  options: ConfirmationOptions,
): unknown {
  if (secret(key, options)) return value ? "已设置（内容隐藏）" : "未设置";
  if (Array.isArray(value)) return value.map((v) => safe(v, key, options));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, safe(v, k, options)]),
    );
  if (value === true) return "是";
  if (value === false) return "否";
  return value ?? "";
}
function display(value: unknown, key: string, options: ConfirmationOptions) {
  const field = key.split(".").pop()!;
  if (!secret(field, options) && value !== undefined && value !== null) {
    const custom = (options.format?.[key] || valueFormats[field])?.(value);
    if (custom) return custom;
  }
  const v = safe(value, field, options);
  return (
    (typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)) || "未填写"
  );
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function confirmationPlan(
  path: string,
  raw: unknown,
  options: ConfirmationOptions = {},
): ConfirmationPlan {
  const body = object(raw),
    before = object(options.before);
  const data = {
    ...object(body.data ?? body.values ?? body),
    ...options.extra,
  };
  const clear = Array.isArray(body.clear) ? (body.clear as string[]) : [];
  clear.forEach((key) => {
    data[key] = "";
  });
  if (body.values)
    Object.entries(data).forEach(([key, value]) => {
      if (secret(key, options) && !value && !clear.includes(key))
        data[key] = before[key];
    });
  // Nested objects (e.g. model settings) are compared field by field so the
  // summary lists only what changed instead of a JSON dump.
  const entries: [string, unknown, unknown][] = [];
  for (const [key, value] of Object.entries(data)) {
    if (["version", "id", "clear"].includes(key)) continue;
    const old = before[key];
    if (
      isPlain(value) &&
      options.before !== undefined &&
      (isPlain(old) || old == null)
    )
      for (const [sub, v] of Object.entries(value))
        entries.push([`${key}.${sub}`, v, isPlain(old) ? old[sub] : undefined]);
    else entries.push([key, value, before[key]]);
  }
  const rows = entries
    .filter(
      ([, value, old]) =>
        options.before === undefined || !sameValue(old, value),
    )
    .map(([key, value, old]) => {
      const field = key.split(".").pop()!;
      return {
        label:
          options.labels?.[key] ||
          options.labels?.[field] ||
          labels[key] ||
          labels[field] ||
          field,
        before:
          options.before === undefined
            ? undefined
            : display(
                old ?? (typeof value === "boolean" ? false : old),
                key,
                options,
              ),
        after: clear.includes(key) ? "清除" : display(value, key, options),
      };
    });
  const warning =
    path.includes("/memberships/") && data.status === "unbound"
      ? "解绑将停止使用权限并释放名额；历史作品、订单和分佣归属保留。"
      : path.includes("/commission-payouts/") && data.status === "paid"
        ? "请确认已完成线下打款，本操作仅记录打款结果。"
        : undefined;
  return {
    title: options.title || `确认修改${names[path.split("/")[2]] || "记录"}`,
    warning,
    rows,
  };
}
