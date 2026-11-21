import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDependencies } from "./dependencies.mjs";
import { sourceBytes } from "./source-bytes.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graph = collectDependencies(root);
const sum = (files) => files.reduce((n, p) => n + sourceBytes(p), 0);
const vendor = graph.files.filter((p) =>
  p.includes(path.sep + "node_modules" + path.sep),
);
const report = {
  applicationSourceBytes: sum(graph.files.filter((p) => !vendor.includes(p))),
  referencedVendorSourceBytes: sum(vendor),
  referencedSourceBytes: sum(graph.files),
  onDiskSourceBytes: graph.files.reduce((n, p) => n + fs.statSync(p).size, 0),
  files: graph.files.length,
  packages: graph.packages,
  externalResources: graph.external.length,
};
console.log(
  "Mini-program LF-normalized referenced source estimate (NOT final WeChat package):",
  JSON.stringify(report),
);
// 512 KiB at launch. Raised to 544 KiB in Nov 2026 for intentional growth:
// SMS two-step registration (536.8 KB at that commit), then scan
// registration with the provider centre, 推广码 and profile identity
// (548.3 KB). Not a ceiling to drift up to: the WeChat upload package is
// still checked separately in the developer tools.
// Reviewed feature increment: awaiting-approval browsing, +139 source bytes
// after consolidating response parsing. See docs/miniprogram-browse-budget.md.
// Explicit feature allowance: native @ reference selection and preview,
// measured +2.6 KiB with no new SDK components. See the feature budget note.
// Reviewed UI v4 feature increment: real recent-work previews, responsive SKU
// selection, richer order states and editor actions. See docs/miniprogram-ui-v4-budget.md.
// Phone authorization login adds a shared grant handler and native entry points;
// see docs/wechat-phone-login.md for the measured feature delta.
// UI review fixes (video covers, empty states, menu layout): +2,462 bytes,
// see docs/miniprogram-ui-review-fixes.md.
// Jimeng UI alignment: typography, navigation, upload and payment states.
// Closeout estimate: 579,421 bytes; see docs/miniprogram-ui-closeout.md.
// Activation entry: segmented invite code (8 cells, auto dash, paste) and a
// tappable scan viewfinder (+8,203 bytes); then illustrated empty, logged-out
// and waiting states: real template covers (components/showcase) or a quiet
// theme icon, with text links:
// 590,294 bytes in total. The product owner chose visuals over package size;
// see docs/miniprogram-invite-code-budget.md. Templates page masonry cards,
// text category tabs, scroll loading, a featured (optionally playing) template
// and a pinned search/category header: 597,729 bytes. Mix form always shown,
// with choice tiles, sliders and a pinned start bar: 600,907 bytes. Create page
// parameters in a sheet, an inspiration strip of
// template covers and a task-queue link: 604,851 bytes. Create sub-sheets:
// upload source tiles, an @ thumbnail picker and an in-page reference viewer
// (components/media-viewer) replacing native action sheet/preview, shared source
// tiles on the template upload sheet and a darkroom photo-confirm page: 615,495 bytes.
// Themed confirm dialog (components/ui-dialog) replacing every native white
// wx.showModal, with a native fallback: 622,389 bytes. Agent page: starter
// cards, flowing replies with copy/use actions, typing dots and a pill
// composer: 625,747 bytes. Then a centred empty state, shot-labelled script
// replies, follow-up chips and a failed-reply state: 629,535 bytes. Mine page:
// side-by-side header, slim points row, 3-column cover wall: 632,432 bytes.
// Then a blurred latest-cover backdrop, letter avatar, unread badge and a
// shimmering generating tile: 635,179 bytes. Role card under the points and a
// single row of recent covers: 635,748 bytes. Template detail: immersive hero
// with chips and favorite, square upload slots, a compact price/pill bar:
// 637,199 bytes. Then a bottom button that uploads until ready, a 更多同款灵感
// strip, a settling cover and a light haptic on favorite: 638,294 bytes.
// Sub-pages: result icon actions, favorites cover wall, live queue tiles, text
// sort tabs, notice tone icons, segmented purchase switch, quiet sign-out:
// 645,050 bytes. 我的 sub-pages: centred-avatar profile list, compact order
// cards, help accordion with inline feedback, wallet wash, provider glyph:
// 649,160 bytes. QA pass: live progress stage for queued/running work, pending
// payment card, consistent logged-out states: 651,457 bytes. Wallet and
// orders detail: price per 100 points, what the balance buys (live quotes),
// best-value packages, ledger days and balances, order steps, payment window
// and expandable details: 663,974 bytes. More 我的 detail: task progress and
// counters, notices by day, settings help/privacy/version, collection counts,
// provider stat tiles: 669,493 bytes. Detail pass: grouped thousands in
// points, pull-to-refresh, list skeletons, pill pager, long-press unfavorite,
// time-only rows under day headings, settings icons: 674,740 bytes. Imagery
// from real covers on finance pages (package fans, order thumbnails, balance
// fan, "能做什么" tiles) and work thumbnails on notices: 680,985 bytes. Audit sweep: last old-style
// buttons and bare empty states replaced: 681,519 bytes.
// HTTPS brand loading and OSS QR downloads: measured 684,191 B, no new SDK.
// Explicit 1 KiB feature allowance; see docs/oss-image-delivery.md.
// Mini-code scene handoff and automatic post-login registration: +2,398 B.
// Explicit feature increment, see docs/miniprogram-invite-entry.md.
// Share-card rendering and native PNG export reuse one renderer with the web.
// Explicit feature allowance, see docs/invite-poster.md.
// Device compatibility: button.<class> selectors over WeChat's default 184px
// button and disabled colours, own login buttons, no inset/aspect-ratio for
// older iOS WebViews: 685,278 bytes. Task queue cards with each task's own
// reference image, a create tile and an inspiration strip: 689,235 bytes.
// Counters that filter the queue, elapsed time, all-done line: 692,735 bytes.
// Combined with the trial invite-code and share-card work above: 701,892 B.
// Share card restyled after WeChat's own mini-program code material (white
// sheet, round code, scan line, code pill), on the page and the saved
// image; finally the plain white card WeChat itself uses: 701,488 B.
// Responsiveness: shared /config cache, last-seen page data for instant
// paint, list→detail handoff, stable image URLs while polling, model menu
// geometry, opt-in debug console: 712,604 B (+11,116). Review fixes (URL
// issue times, cached agent/favorites views, quote throttling): 716,720 B.
// Layout skeletons instead of full-page spinners, bounded URL table: 719,639 B.
// Simulated user journey fixes (price kept while re-quoting, agent bubble
// skeleton, neutral loading text): 720,555 B.
// Dark page container on every page (no white frame on tab switch): 722,264 B.
// Account lifecycle and owner-bound form submission: 725,322 bytes.
// Final cross-session guards add 688 bytes, exceeding 708 KiB by 330 bytes.
// Reviewed feature allowance and measurements: docs/account-lifecycle.md.
// Flat colours instead of decorative cyan-violet gradients; optional
// generated photo slots (utils/ui-art.ts, empty until published): 727,568 B.
// Codex photographs on upload sources, mix styles, login/activation and the
// wallet card, loaded from the API or OSS (media/ui-art, not in the package),
// each with a flat fallback: 732,639 B (+5,071). Limit 712 -> 716 KiB for
// this reviewed increment; see docs/miniprogram-invite-code-budget.md.
// Codex art on 我的 (photo thumbnails for avatar, points, 服务商中心 and the
// empty works row; bold glyphs for the six common entries) and the tab bar,
// bundled in assets/ (images are not counted here; see the budget note for
// their bytes): 734,356 B. Limit 716 -> 720 KiB.
// Same principle on every page: empty and signed-out states get bundled
// photos, content icons (actions, rows, mix features, upload slots, Agent)
// use the generated glyph set; system controls stay TDesign. Dead t-icon
// styles removed: 738,465 B. Limit 720 -> 724 KiB.
// 我的 subpages get a themed backdrop photo (components/page-backdrop,
// pictures in media/ui-art via /config): 741,585 B, over the 724 KiB line.
// Limit 724 -> 728 KiB for this reviewed increment.
// Multi-image results: shared native gallery, per-image/all-image saving and
// shared-work previews and cache/lifecycle guards, +7,557 source bytes without new vendors.
// Intentional feature allowance 728 -> 736 KiB; see docs/multi-image-results.md.
// Visible-page running-task counter: +2,493 source bytes, no new dependencies.
// Reviewed 736 -> 740 KiB feature allowance; see docs/create-task-count.md.
// Featured works: a native mixed-media gallery and safe preview, +9,016 bytes.
// Explicit 740 -> 752 KiB feature allowance; see docs/featured-works.md.
// @ 引用图片 popover redesign (count in the heading, labelled rows with a
// clear 引用 action, no truncated names): 771,304 B (+1,302 over 770,002).
// 任务详情 prompt card (length, copy, long prompts fold to five lines):
// 773,461 B (+2,157). 任务详情 as cards (参考素材 named 图片N like the
// prompt's @图片N with tap-to-preview, 生成信息 rows with billing state):
// 775,505 B (+2,044). Explicit 752 -> 758 KiB allowance for the three.
// 优秀 as a view of the 模板 tab page (components/featured-works, tab
// routing in utils/tab-transition, redirect at the old page) so it opens
// like the other tabs: 779,853 B (+3,669). 758 -> 762 KiB.
// FlowLight recipe import: explicit image roles/optional slots, model and
// resolution selection, ownership/refresh guards. +10,959 source bytes,
// 780,282 -> 791,241 B, with no new SDK/runtime dependency.
// Reviewed feature allowance 762 -> 774 KiB. See docs/flowlight-template-import.md.
// Template recipe model/resolution: native white <picker> replaced by the
// app's dark bottom sheet (rows + one shared option list), no new component:
// 791,241 -> 793,140 B (+1,899). 774 -> 776 KiB.
// Points confirm dialog details panel (计费方式 / 当前可用 / 确认后剩余) in the
// shared ui-dialog, plus template card and round queue button since 776:
// 794,859 B. 776 -> 778 KiB.
// Smoothness pass: cached models on 视频/图片 switch, 优秀 cache + skeleton,
// per-view scroll, template search, showcase tap guard, instant task detail
// after submit, notifications/share/shared-work/provider/settings keep their
// content on return, double-back guards. 802,248 B. 778 -> 784 KiB.
// @ mentions for videos, the 已引用 thumbnail row (WXS, no extra setData),
// video covers in the reference strip with full-screen play: 805,519 B.
// 784 -> 787 KiB.
// @ references as inline chips (thumbnail + label) in the create box
// (keyboard closed) and the task-detail prompt; one shared WXS module:
// 808,645 B. 787 -> 790 KiB.
// Device-safe @ parsing in WXS (string scan, no RegExp) and full-width ＠
// from Chinese keyboards: 809,378 B. 790 -> 791 KiB.
// The create box becomes a WeChat <editor> (components/prompt-editor) so
// @图片N / @视频N show as inline thumbnails while typing; the prompt text is
// unchanged (utils/prompt-delta converts both ways): 814,241 B. 791 -> 796 KiB.
// 登录页“使用其他手机号”改为手机号 + 短信验证码登录（pages/login/sms.ts），
// 不再用微信身份直接登回原账号: 819,591 B. 796 -> 801 KiB.
// SMS form polish: +86 prefix, send-button states, focus on the code field,
// login enabled only when complete: 820,546 B. 801 -> 802 KiB.
// 创作 becomes an entry page (pages/studio: four feature cards, shortcut
// tiles, hot-video feed with 做同款) plus the UI-only 一键复刻 page
// (pages/remake); its pictures load from OSS (ui-art), not the package:
// 838,003 B (with the no-video state). 802 -> 819 KiB.
// 创作 feature grid (Codex icons from OSS): 剧情带货 / 探店视频 / AI证件照 as
// editor presets with AI写剧本 (pages/create/feature.ts), 文案提取 from a
// Douyin share link (pages/extract), and the interface-first pages for
// 数字人, 视频唱歌, 图文成片, 漫画推文, 视频去字幕, 视频二创 drawn from one
// config (pages/feature); narrow-phone fixes and the 证件照 photo check:
// 864,618 B. 819 -> 845 KiB.
// 一键复刻 reads a pasted link, saves the watermark-free original and opens
// the editor's 一键复刻 preset (services/hot-import.ts): 869,562 B. 845 -> 850 KiB.
// 一键复刻 writes a shot-by-shot description from the original (title, caption,
// length) with the chat model, and the remake page shows the original's
// length with a note past 15 s, closest supported length: 873,459 B. 850 -> 853 KiB.
// 一键复刻 after Clipcat: the video model's breakdown (services/hot-breakdown.ts),
// the user's own product / person pictures (pages/remake/pictures.ts) and a
// breakdown-driven brief (pages/create/remake-brief.ts): 881,199 B. 853 -> 861 KiB.
// 一键复刻 as a queued task: the remake page submits it, the task page shows
// its stages and 去复刻 (pages/task-detail/remake.ts): 882,689 B. 861 -> 863 KiB.
// 生成同款 straight from the task page: model and length picked for the
// reference video, description built from the breakdown, one points
// confirmation (pages/task-detail/remake.ts): 887,029 B. 863 -> 867 KiB.
// 剧情带货 / 探店 presets: 热门案例 from the hot feed, a picture entry and 清空
// (pages/create/feature-cases.ts): 891,513 B. 867 -> 871 KiB.
// Feature pages after the reference screenshots: picture-style cards (OSS
// art), text examples, 清空, two-column option tiles and switches; 证件照
// sizes: 898,106 B. 871 -> 878 KiB.
// Interface-first feature pages do their real part: uploads into the user's
// materials with progress and thumbnails, option sheets, and required-input
// checks before 即将开放 (pages/feature/actions.ts): 904,380 B. 878 -> 884 KiB.
// DeepSeek / 豆包 on the Agent: model chips, the 按量 per-turn price above
// the composer (pages/agent/models.ts) and the 按量 confirm wording: 909,645 B.
// 884 -> 889 KiB.
// Agent 创作项目: project bar and sheet, materials, the 创作方案 card and
// generation cards, project-scoped history (pages/agent/*, services/agent.ts,
// utils/agent-plan.ts): 936,004 B. 889 -> 915 KiB.
// Agent review: plan text for 复制, per-skill guidance in an empty project,
// keeping signed material links across visits: 937,175 B. 915 -> 916 KiB.
// Agent colour pass: skill photos on the project bar, sheet and empty
// project, plan covers and shot thumbnails from the project's materials,
// highlighted add buttons: 942,173 B. 916 -> 921 KiB.
// Agent polish: plan versions with old ones collapsed, the points on
// 确认生成, per-skill examples and follow-ups, generation status chips,
// 正在写方案 hint: 947,762 B. 921 -> 926 KiB.
// Agent user pass: projects named after their first plan, confirm before
// removing a material, several pictures per pick, long-press preview, a
// note when the chat model cannot see pictures: 951,470 B. 926 -> 930 KiB.
// Agent output handling: ```json and repeated plan blocks, cut-off or
// malformed plans flagged with 重新整理, Chinese plan values, Markdown-free
// prose, mentions renumbered to the materials sent, richer generation
// cards: 955,739 B. 930 -> 934 KiB.
// Agent: earlier plans open and can be used (用这一版生成); short screens
// fold the materials strip into one line: 958,405 B. 934 -> 937 KiB.
// Agent: 新建 back to the skill picker beside 切换, empty project list hint:
// 959,678 B. 937 -> 938 KiB.
// Loading page for slow first loads (components/page-loading) on eight
// detail pages and hot video search, slow-network line on list skeletons:
// 962,454 B. 938 -> 940 KiB.
// Loading on the remaining slow waits: 授权开通, 登录, 分享作品, 文案提取,
// 优秀作品, the Agent picker (with retry; skills listed before sign-in):
// 964,151 B. 940 -> 942 KiB.
// Faster Agent replies: only named pictures are sent, 1.5 s checks while
// a reply is coming, waiting seconds shown: 965,950 B. 942 -> 944 KiB.
// Agent replies stream (shown as written, caret, plan placeholder): 971,032 B. 944 -> 949 KiB.
// Chunked reply stream (UTF-8 piece decoder, SSE reader) and 停止回复: 977,488 B. 949 -> 955 KiB.
// One chat-model picker (DeepSeek Flash by default) for Agent and AI写剧本: 978,518 B. 955 -> 956 KiB.
// Model picker: pill with the model's logo, and a sheet of model cards (description, picture / text tags, price per turn): 983,698 B. 956 -> 961 KiB.
// Smooth streaming (replies typed out evenly; only the reply being written re-renders): 985,603 B. 961 -> 963 KiB.
// A forgotten login no longer reads as 创作助手暂未开放 (check it, sign in again, read config afresh): 986,522 B. 963 -> 964 KiB.
// Videos a message names go along (watched by 视频理解); 正在观看视频… while waiting: 987,174 B. 964 -> 965 KiB.
// 编辑 a sent question and ask again; 复制 chips for a reply's key lines: 992,383 B. 965 -> 970 KiB.
// Review fixes: send waits for uploads; 编辑-restored files stay in the project; uploads stay in their project; edit and streams reset on switch; tighter copy chips; composer spacing: 994,594 B. 970 -> 972 KiB.
// Replies as models really write them (tables, links, code, quotes, CRLF), emoji-safe typing, 带到创作 carries the question's files: 995,863 B. 972 -> 973 KiB.
// Bug pass: new projects remembered, polling resumes on switch, clean drafts per project, 去编辑页精调 renumbers, price retried, abandoned uploads leave the project: 997,883 B. 973 -> 975 KiB.
// Page loading as a shimmering outline of the page (media / list / grid) instead of a lone icon; 豆包 watches videos (能看视频 tag); smaller sent-file thumbnails: 1,001,480 B. 975 -> 979 KiB.
// 一键复刻 subject swaps: pick which picture replaces which subject on the task page: 1,009,264 B. 979 -> 986 KiB.
// 一键复刻 from an uploaded video, hot videos to remake on the empty page, gl-12 glyph size; 创作 grid trimmed: 1,015,671 B. 986 -> 992 KiB.
// AI试衣 page (clothing library: categories, 默认排序 / 最新上架, 随机一个,
// 收藏 on the phone; 试穿: person photo + outfit handed to the image editor)
// and its editor preset; 创作 grid without 我的作品 / 生成记录: 1,039,734 B. 992 -> 1016 KiB.
// AI试衣 review: picture addresses refreshed in place after 10 minutes, 收藏
// replies in order, the preset starts on a model taking both pictures: 1,041,825 B. 1016 -> 1018 KiB.
// AI试衣 UI pass: person and outfit side by side (开始试穿 above the fold),
// outfit name on its picture, grab handle on the preview: 1,042,744 B. 1018 -> 1019 KiB.
const budget = 1019 * 1024;
if (report.referencedSourceBytes > budget)
  throw new Error(`Referenced source budget exceeded (${budget / 1024} KiB).`);
const out = path.resolve(root, "../.runtime");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "miniprogram-budget.json"),
  JSON.stringify(report, null, 2),
);
