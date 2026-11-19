// The create box shows each @图片N / @视频N as an inline thumbnail (WeChat
// <editor>), while the prompt itself keeps the text "@图片N". These convert
// between the prompt string and the editor (drawn from HTML, read back
// from its Quill delta).
type Ref = { id: string; isImage: boolean; isVideo?: boolean; data: { url: string; thumbnailUrl?: string } };
type Op = { insert?: unknown; attributes?: Record<string, unknown> };
const VIDEO_GLYPH = "/assets/glyphs/video-muted.png";

// "@图片1" → its thumbnail, numbered per kind in strip order.
function thumbnails(assets: Ref[]) {
  const map: Record<string, string> = {};
  let image = 0, video = 0;
  for (const a of assets) {
    if (a.isImage) map["@图片" + ++image] = a.data.url;
    else if (a.isVideo) map["@视频" + ++video] = a.data.thumbnailUrl || VIDEO_GLYPH;
  }
  return map;
}

const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Spaces are drawn as &nbsp; so HTML parsing cannot collapse them (a lost
// space after "@图片1" would turn "@图片1 2个人" into "@图片12个人").
const text = (t: string) => escape(t).replace(/ /g, "&nbsp;");
// Rounded, centred on the text line, with a little air on both sides.
const IMG_STYLE = "width:22px;height:22px;border-radius:6px;object-fit:cover;vertical-align:-5px;margin:0 3px";

// The editor's HTML: one paragraph per line; each known reference is an
// inline thumbnail whose alt keeps its "@图片N" text.
export function toHtml(prompt: string, assets: Ref[]) {
  const thumbs = thumbnails(assets);
  return prompt.split("\n").map((line) => {
    let html = "";
    for (let i = 0; i < line.length; ) {
      const match = /^[@＠](图片|视频)\d+/.exec(line.slice(i, i + 12));
      const label = match ? "@" + match[0].slice(1) : "";
      if (match && thumbs[label]) {
        html += `<img src="${escape(thumbs[label])}" alt="${label}" style="${IMG_STYLE}">`;
        i += match[0].length;
      } else html += text(line[i++]);
    }
    return `<p>${html || "<br>"}</p>`;
  }).join("");
}

export function fromDelta(ops: Op[], assets: Ref[]) {
  const bySrc: Record<string, string> = {};
  const thumbs = thumbnails(assets);
  for (const label of Object.keys(thumbs)) bySrc[thumbs[label]] = label;
  let out = "";
  for (const op of ops) {
    if (typeof op.insert === "string") out += op.insert;
    else if (op.insert && typeof op.insert === "object") {
      const alt = String(op.attributes?.alt || "");
      const src = String((op.insert as { image?: string }).image || "");
      out += /^@(图片|视频)\d+$/.test(alt) ? alt : bySrc[src] || "";
    }
  }
  return out.replace(/\u00a0/g, " ").replace(/\n$/, "");
}

// Where the caret sits after an edit: just past what was inserted.
export function caretAfter(before: string, after: string) {
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return after.length - tail;
}
