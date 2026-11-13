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
const ART_VERSION = 2;
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
