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
  // Agent skills: picker, project bar, project sheet, empty project, plan covers
  skillProduct: "skill-product",
  skillStore: "skill-store",
  skillImage: "skill-image",
  skillGeneral: "skill-general",
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
  // 创作 entry page: four feature cards
  hubVideo: "hub-video",
  hubImage: "hub-image",
  hubMix: "hub-mix",
  hubRemake: "hub-remake",
  // feature tiles
  toolAd: "tool-ad",
  toolShop: "tool-shop",
  toolAvatar: "tool-avatar",
  toolArticle: "tool-article",
  toolSing: "tool-sing",
  toolRemix: "tool-remix",
  toolExtract: "tool-extract",
  toolIdphoto: "tool-idphoto",
  toolComic: "tool-comic",
  toolTryon: "tool-tryon",
  // 3D icons for rows, menus and states (components/art-icon), full-bleed tiles
  icFeatured: "ic-featured", // 优秀作品
  icOrders: "ic-orders", // 充值订单
  icHistory: "ic-history", // 生成记录
  icNotice: "ic-notice", // 消息通知
  icHelp: "ic-help", // 帮助与反馈
  icSettings: "ic-settings", // 设置
  icQrcode: "ic-qrcode", // 推广码、扫码登记
  icPlay: "ic-play", // 自动播放
  icStats: "ic-stats", // 使用统计
  icPrivacy: "ic-privacy", // 隐私保护指引
  icInfo: "ic-info", // 积分说明、当前版本
  icRunning: "ic-running", // 处理中
  icFailed: "ic-failed", // 失败
  icDone: "ic-done", // 已完成
  icRecharge: "ic-recharge", // 充值到账
  icInvite: "ic-invite", // 邀请码
  icRefund: "ic-refund", // 积分退回
  icPoints: "ic-points", // 积分使用
  icLink: "ic-link", // 文案提取: 短视频链接
  icPhotoText: "ic-phototext", // 图片提取
  icAudio: "ic-audio", // 音频提取
  icVideo: "ic-video", // 本地视频
  icWxfile: "ic-wxfile", // 微信文件提取
  icRemake: "ic-remake", // 一键复刻: 要复刻的视频
  icPaste: "ic-paste", // 粘贴
  icScript: "ic-script", // 视频文案、包含创作描述
  icSpark: "ic-spark", // 去豆播找灵感
  icBrowse: "ic-browse", // 先浏览小程序
  icRefresh: "ic-refresh", // 刷新授权状态
  icLogout: "ic-logout", // 退出登录
  // AI试衣 (pages/tryon): backdrop, 3D icons, slot and empty-state pictures
  bgTryon: "bg-tryon", // AI试衣 top
  tryonGallery: "tryon-gallery",
  tryonFit: "tryon-fit",
  tryonFav: "tryon-fav",
  tryonAll: "tryon-all",
  tryonDice: "tryon-dice",
  tryonUpload: "tryon-upload",
  tryonKeepBg: "tryon-keep-bg",
  tryonPerson: "tryon-person",
  tryonOutfit: "tryon-outfit",
  tryonEmptyFav: "tryon-empty-fav",
  tryonEmptyRack: "tryon-empty-rack",
  // 图文成片 / 漫画推文 picture-style cards
  styleGeneral: "style-general",
  styleRomance: "style-romance",
  styleXianxia: "style-xianxia",
  styleSuspense: "style-suspense",
  styleGuoman: "style-guoman",
};
export type Art = Record<keyof typeof NAMES, string>;

// Every /config signs afresh, so a new address would reload (and flash) a
// picture already on screen. The OSS path carries the content hash: the same
// path with a new signature keeps the address in use (for 12 h), a new path
// means a replaced picture and is used at once.
const kept: Record<string, { url: string; at: number }> = {};
const objectPath = (url: string) => url.split("?")[0];
function signedUrl(name: string, url: string | undefined) {
  const old = kept[name];
  if (old && Date.now() - old.at < SIGNED_MS && (!url || objectPath(url) === objectPath(old.url))) return old.url;
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

// Fill a page's picture fields. Pages start with "" so nothing unloadable
// is requested. A config from the last 12 h holds valid signed addresses and
// paints at once; /config is heavy, so it is fetched again for pictures only
// when the stored copy is over 30 min old (replaced pictures then show up),
// or when there is none.
const RECHECK_MS = 30 * 60 * 1000;
export function showArt(page: { setData(data: Record<string, unknown>): void }, pick: (art: Art) => Record<string, unknown>) {
  const seen = peekConfig(SIGNED_MS)?.uiArt;
  if (seen) page.setData(pick(resolve(seen)));
  if (seen && peekConfig(RECHECK_MS)) return;
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
  featured: glyph("featured"), // 常用功能: 优秀作品
  orders: glyph("orders"),
  favorites: glyph("favorites"),
  history: glyph("history"),
  notifications: glyph("notifications"),
  help: glyph("help"),
  settings: glyph("settings"),
};
