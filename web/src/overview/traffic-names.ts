// Display names for mini-program routes, WeChat scenes and platforms.
const pages: Record<string, string> = {
  templates: "创作模板（首页）",
  create: "创作",
  mix: "混剪",
  agent: "创作助手",
  mine: "我的",
  tasks: "任务",
  "task-detail": "任务详情",
  works: "作品",
  wallet: "积分",
  orders: "充值订单",
  "template-detail": "模板详情",
  "hot-videos": "热门视频",
  "hot-detail": "视频详情",
  library: "素材库",
  "upload-preview": "确认照片",
  activate: "授权开通",
  login: "登录",
  notifications: "消息通知",
  preferences: "设置",
  profile: "个人资料",
  share: "分享作品",
  "shared-work": "作品分享",
};

// Mini-program route "pages/create/index" → "创作"; web paths and app
// screen names show as sent, except the share page.
export function pageName(route: string) {
  if (route === "/s/*") return "作品分享页";
  if (!route.startsWith("pages/")) return route || "未知页面";
  const key = route.replace(/^pages\//, "").replace(/\/index$/, "");
  return pages[key] || key || "未知页面";
}

export const clientNames: Record<string, string> = {
  miniprogram: "小程序",
  web: "网页",
  app: "APP",
};

const sources: Record<string, string> = {
  wechat: "微信内打开",
  direct: "直接访问",
  appstore: "App Store",
};

// Web referrer host / utm_source, or an app channel.
export const sourceName = (s: string) => sources[s] || s;

const scenes: [number[], string][] = [
  [[1001], "发现栏小程序主入口"],
  [[1005, 1006], "搜索"],
  [[1007], "单人聊天会话分享"],
  [[1008], "群聊分享"],
  [[1011, 1012, 1013], "扫码"],
  [[1035], "公众号"],
  [[1037], "小程序打开"],
  [[1047, 1048, 1049], "小程序码"],
  [[1089], "我的小程序 / 最近使用"],
  [[1104], "收藏"],
];

export function sceneName(scene: number) {
  const hit = scenes.find(([codes]) => codes.includes(scene));
  return hit ? hit[1] : `其他（场景值 ${scene}）`;
}

const platforms: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  ohos: "鸿蒙",
  windows: "Windows",
  mac: "macOS",
  devtools: "开发者工具",
  unknown: "未知",
  other: "其他",
};

export const platformName = (p: string) => platforms[p] || p;

// 75 → "1 分 15 秒"; under a minute stays in seconds.
export function duration(seconds: number) {
  const s = Math.round(seconds || 0);
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}
