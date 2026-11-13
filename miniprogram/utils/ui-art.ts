import { media } from "../services/media";

// Decorative photographs generated with Codex. Originals live in
// media/ui-art (see media/ui-art/README.md for what each one is for).
//
// Where they load from:
// - ART_BASE empty: /api/ui-art/<name> redirects to private OSS after the
//   deployment sync, with a local fallback when OSS is not configured.
// - ART_BASE is only needed for a separately managed public HTTPS CDN.
//   Allowlist the API and destination OSS/CDN domains in WeChat settings.
//
// Every spot keeps its flat colour or icon underneath, so a picture that
// fails to load leaves the plain design rather than a hole. Bump ART_VERSION
// after replacing a picture so caches fetch the new one.
const ART_BASE = "";
const ART_VERSION = 4;
const art = (name: string) =>
  ART_BASE
    ? `${ART_BASE}/${name}.jpg?v=${ART_VERSION}`
    : media(`/api/ui-art/${name}?v=${ART_VERSION}`);

export const UI_ART = {
  mineBackdrop: art("mine-bg"), // 我的: backdrop before the user has a work
  agentScript: art("agent-script"), // Agent starters
  agentPrompt: art("agent-prompt"),
  agentCoffee: art("agent-coffee"),
  uploadExample: art("upload-example"), // 模板详情: how to shoot a product
  srcImage: art("src-image"), // upload sources: 图片 / 相册
  srcVideo: art("src-video"),
  srcAudio: art("src-audio"),
  srcCamera: art("src-camera"), // 拍照
  srcChat: art("src-chat"), // 聊天文件
  mixNatural: art("mix-natural"), // 混剪 styles
  mixFast: art("mix-fast"),
  mixCinema: art("mix-cinema"),
  loginBackdrop: art("login-bg"), // 登录 / 授权开通
  walletBackdrop: art("wallet-bg"), // 我的积分 balance card
};

// Small art bundled in the package so it paints with the page instead of
// popping in (assets/photos and assets/glyphs, generated with Codex). Thumbnails are photos in
// the same style as UI_ART; the common entries are one bold white glyph set
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
