import { media } from "../services/media";

// Decorative photographs generated with Codex. Originals live in
// media/ui-art (see media/ui-art/README.md for what each one is for).
//
// Where they load from:
// - ART_BASE empty: the API serves them at /api/ui-art/<name> with a long
//   cache (needs the server redeployed with media/ui-art).
// - After uploading media/ui-art/*.jpg to OSS/CDN unchanged, set ART_BASE to
//   that folder's public https address (no trailing slash), e.g.
//   "https://cdn.example.com/doubo/ui-art", and add the domain to the
//   mini-program's downloadFile allowlist.
//
// Every spot keeps its flat colour or icon underneath, so a picture that
// fails to load leaves the plain design rather than a hole. Bump ART_VERSION
// after replacing a picture so caches fetch the new one.
const ART_BASE = "";
const ART_VERSION = 1;
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
