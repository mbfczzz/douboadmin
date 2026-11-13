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
const budget = 669 * 1024;
if (report.referencedSourceBytes > budget)
  throw new Error(`Referenced source budget exceeded (${budget / 1024} KiB).`);
const out = path.resolve(root, "../.runtime");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "miniprogram-budget.json"),
  JSON.stringify(report, null, 2),
);
