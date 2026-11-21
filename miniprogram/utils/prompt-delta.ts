// The create box shows each @图片N / @视频N as an inline thumbnail (WeChat
// <editor>), while the prompt itself keeps the text "@图片N". These convert
// between the prompt string and the editor's Quill delta. (Drawing it from
// HTML broke signed image links on devices, so the delta is used both ways.)
type Ref = { id: string; isImage: boolean; isVideo?: boolean; data: { url: string; thumbnailUrl?: string } };
type Op = { insert?: unknown; attributes?: Record<string, unknown> };
const SIZE = "22px";

// "@图片1" → its thumbnail, numbered per kind in strip order. The <editor>
// on phones cannot load package files (a broken "?" box), so a mention with
// no picture yet (or a video without a cover) stays text; the 已引用 row
// under the box shows it as 待上传.
function thumbnails(assets: Ref[]) {
  const map: Record<string, string> = {};
  let image = 0, video = 0;
  for (const a of assets) {
    if (a.isImage) map["@图片" + ++image] = a.data.url;
    else if (a.isVideo) map["@视频" + ++video] = a.data.thumbnailUrl || "";
  }
  return map;
}

export function toDelta(prompt: string, assets: Ref[]): Op[] {
  const thumbs = thumbnails(assets), ops: Op[] = [];
  let text = "";
  for (let i = 0; i < prompt.length; ) {
    const match = /^[@＠](图片|视频)\d+/.exec(prompt.slice(i, i + 12));
    const label = match ? "@" + match[0].slice(1) : "";
    if (match && thumbs[label]) {
      if (text) ops.push({ insert: text });
      text = "";
      ops.push({ insert: { image: thumbs[label] }, attributes: { alt: label, width: SIZE, height: SIZE } });
      i += match[0].length;
    } else text += prompt[i++];
  }
  ops.push({ insert: text + "\n" }); // a Quill document ends with a newline
  return ops;
}

export function fromDelta(ops: Op[], assets: Ref[]) {
  const bySrc: Record<string, string> = {};
  const thumbs = thumbnails(assets);
  for (const label of Object.keys(thumbs)) if (thumbs[label]) bySrc[thumbs[label]] = label;
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
