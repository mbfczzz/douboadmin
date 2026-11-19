import type { VisibleEditor } from "./editor-types";
import { positionMention } from "./mention-position";

// Typing "@" opens a caret-adjacent picker of the uploaded images and videos;
// picking one inserts "@图片N " / "@视频N " at the cursor (numbered per kind,
// in strip order, as on task detail). A snapshot guards against stale picks.
type Snapshot = { text: string; cursor: number; ids: string[] };
type Asset = VisibleEditor["data"]["assets"][number];
const choosing = new WeakMap<object, Snapshot>();

// Images first, then videos, each labelled by its own order.
export function mentionables(assets: Asset[]) {
  const label = (kind: string, list: Asset[]) => list.map((a, i) => ({ id: a.id, label: kind + (i + 1), url: a.isImage ? a.data.url : a.data.thumbnailUrl || "", video: !a.isImage }));
  return [...label("图片", assets.filter((a) => a.isImage)), ...label("视频", assets.filter((a) => a.isVideo))];
}

export function cancelMention(page: VisibleEditor) {
  choosing.delete(page);
  if (!page.visible || page.destroyed) page.setData({ promptFocus: false, keyboardHeight: 0 });
  if (page.data.mentionOpen) page.setData({ mentionOpen: false, mentionReady: false, mentionPrefix: "" });
}

export function chooseMention(page: VisibleEditor, cursor: number) {
  const text = page.data.prompt;
  if (!page.visible || page.destroyed) { cancelMention(page); return; }
  const previous = choosing.get(page);
  if (previous?.text === text && previous.cursor === cursor) return;
  cancelMention(page);
  if ((text[cursor - 1] !== "@" && text[cursor - 1] !== "＠") || page.data.busy) return; // Chinese keyboards may type ＠
  const items = mentionables(page.data.assets);
  if (!items.length) {
    wx.showToast({ title: "请先添加参考图片或视频", icon: "none" });
    return;
  }
  choosing.set(page, { text, cursor, ids: items.map((a) => a.id) });
  page.setData({ mentionOpen: true, mentionReady: false, mentionPrefix: text.slice(0, cursor - 1), mentionItems: items });
  positionMention(page);
}

export function pickMention(page: VisibleEditor, index: number) {
  const snap = choosing.get(page);
  cancelMention(page);
  if (!snap || !page.visible || page.destroyed || page.data.prompt !== snap.text) return;
  const items = mentionables(page.data.assets);
  if (items.map((a) => a.id).join() !== snap.ids.join() || !items[index]) return;
  // A full-width ＠ becomes "@" so the model reads a standard reference.
  const text = snap.text.slice(0, snap.cursor - 1) + "@" + snap.text.slice(snap.cursor);
  insertMention(page, text, snap.cursor, items[index].label);
}

// Inserts "图片N " (or "视频N ") right after an "@" that sits before `cursor`.
export function insertMention(page: VisibleEditor, text: string, cursor: number, label: string) {
  const token = label + " ";
  const prompt = text.slice(0, cursor) + token + text.slice(cursor);
  if (Array.from(prompt).length > page.data.maxPromptChars) {
    wx.showToast({ title: "引用后超出字数限制", icon: "none" });
    return false;
  }
  page.setData({ prompt, hasPrompt: true, promptCursor: cursor + token.length, promptFocus: true });
  return true;
}

// Appends a mention at the end of the prompt (used from the image viewer).
export function appendMention(page: VisibleEditor, label: string) {
  const base = page.data.prompt;
  const text = base + (base && !/\s$/.test(base) ? " @" : "@");
  return insertMention(page, text, text.length, label);
}

export function clearMentions(text: string) {
  return text.replace(/[@＠](图片|视频)\d+/g, "");
}

// Numbers follow each kind's current order in the attachment strip.
export function removeMention(text: string, kind: "图片" | "视频", number: number) {
  return text.replace(new RegExp(`[@＠]${kind}(\\d+)(?!\\d)`, "g"), (token, raw) => {
    const index = Number(raw);
    return index === number ? "" : index > number ? `@${kind}${index - 1}` : token;
  });
}

// The prompt without the removed reference's mention; later ones of the same
// kind shift down.
export function promptWithout(text: string, assets: Asset[], id: string) {
  const asset = assets.find((a) => a.id === id);
  if (!asset || (!asset.isImage && !asset.isVideo)) return text;
  const same = assets.filter((a) => (asset.isImage ? a.isImage : a.isVideo));
  return removeMention(text, asset.isImage ? "图片" : "视频", same.findIndex((a) => a.id === id) + 1);
}
