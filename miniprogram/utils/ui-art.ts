import { media } from "../services/media";
import { loadConfig, peekConfig } from "./config-cache";

// Decorative photographs generated with Codex. Originals live in
// media/ui-art (see media/ui-art/README.md for what each one is for); the
// deployment syncs them to private Aliyun OSS.
//
// Phones only load <image> from HTTPS, so pages use the signed OSS address
// that /config returns (`uiArt`, name -> URL). Signatures live 24 h, so a
// stored config older than 12 h is not trusted for first paint. Without a
// signed address the API path is used, which only the developer tools (and
// a local server) can load. Every spot keeps its flat colour or icon
// underneath, so a missing picture leaves the plain design, not a hole.
// Bump ART_VERSION after replacing a picture (only matters for the API path;
// OSS keys change with the content).
const ART_VERSION = 4;
const SIGNED_MS = 12 * 60 * 60 * 1000;
const NAMES = {
  mineBackdrop: "mine-bg", // 我的: backdrop before the user has a work
  agentScript: "agent-script", // Agent starters
  agentPrompt: "agent-prompt",
  agentCoffee: "agent-coffee",
  uploadExample: "upload-example", // 模板详情: how to shoot a product
  srcImage: "src-image", // upload sources: 图片 / 相册
  srcVideo: "src-video",
  srcAudio: "src-audio",
  srcCamera: "src-camera", // 拍照
  srcChat: "src-chat", // 聊天文件
  mixNatural: "mix-natural", // 混剪 styles
  mixFast: "mix-fast",
  mixCinema: "mix-cinema",
  loginBackdrop: "login-bg", // 登录 / 授权开通
  walletBackdrop: "wallet-bg", // 我的积分 balance card
  // 我的 subpages (components/page-backdrop)
  bgOrders: "bg-orders", // 充值订单
  bgFavorites: "bg-favorites", // 我的收藏
  bgTasks: "bg-tasks", // 生成记录 / 任务队列
  bgNotice: "bg-notice", // 消息
  bgHelp: "bg-help", // 帮助与反馈
  bgSettings: "bg-settings", // 设置
  bgProfile: "bg-profile", // 编辑资料
  bgProvider: "bg-provider", // 服务商中心
  bgWorks: "bg-works", // 我的作品
};
export type Art = Record<keyof typeof NAMES, string>;

// Every /config signs afresh, so a new address would reload (and flash) a
// picture already on screen. Keep the first signed address for 12 h.
const kept: Record<string, { url: string; at: number }> = {};
function signedUrl(name: string, url: string | undefined) {
  const old = kept[name];
  if (old && Date.now() - old.at < SIGNED_MS) return old.url;
  if (url) kept[name] = { url, at: Date.now() };
  return url;
}

function resolve(signed: Record<string, string> | undefined): Art {
  const art = {} as Art;
  for (const key of Object.keys(NAMES) as (keyof Art)[]) {
    const name = NAMES[key];
    art[key] = signedUrl(name, signed?.[name]) || media(`/api/ui-art/${name}?v=${ART_VERSION}`);
  }
  return art;
}

// Fill a page's picture fields: at once from a recent config, then from the
// current one. Pages start with "" so nothing unloadable is requested.
export function showArt(page: { setData(data: Record<string, unknown>): void }, pick: (art: Art) => Record<string, unknown>) {
  const seen = peekConfig(SIGNED_MS)?.uiArt;
  if (seen) page.setData(pick(resolve(seen)));
  loadConfig().then(
    (config) => page.setData(pick(resolve(config.uiArt))),
    () => !seen && page.setData(pick(resolve(undefined))),
  );
}

// Small art bundled in the package so it paints with the page instead of
// popping in (assets/photos and assets/glyphs, generated with Codex). Thumbnails are photos in
// the same style as the ui-art photos; the common entries are one bold white glyph set
// (PNG with alpha) drawn on the theme tile, matching the tab bar.
const photo = (name: string) => `/assets/photos/${name}.jpg`;
const glyph = (name: string) => `/assets/glyphs/${name}.png`;
export const ICON = {
  avatar: photo("avatar"), // 我的: profile without a photo
  create: photo("create"), // 我的: 还没有作品
  points: photo("points"), // 积分 balance row
  provider: photo("provider"), // 服务商中心
  orders: glyph("orders"), // 常用功能
  favorites: glyph("favorites"),
  history: glyph("history"),
  notifications: glyph("notifications"),
  help: glyph("help"),
  settings: glyph("settings"),
};
