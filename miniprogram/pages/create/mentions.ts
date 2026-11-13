import type { VisibleEditor } from "./editor-types";

// Typing "@" opens a thumbnail sheet of the uploaded images; picking one
// inserts "@图片N " at the cursor. A snapshot guards against stale picks.
type Snapshot = { text: string; cursor: number; ids: string[] };
const choosing = new WeakMap<object, Snapshot>();
const imagesOf = (page: VisibleEditor) => page.data.assets.filter((a) => a.isImage);

export function cancelMention(page: VisibleEditor) {
  choosing.delete(page);
  if (page.data.mentionOpen) page.setData({ mentionOpen: false });
}

export function chooseMention(page: VisibleEditor, cursor: number) {
  const text = page.data.prompt;
  if (text[cursor - 1] !== "@" || choosing.has(page) || page.data.busy) return;
  const images = imagesOf(page);
  if (!images.length) {
    wx.showToast({ title: "请先添加参考图片", icon: "none" });
    return;
  }
  choosing.set(page, { text, cursor, ids: images.map((a) => a.id) });
  page.setData({
    mentionOpen: true,
    mentionItems: images.map((a, i) => ({ id: a.id, url: a.data.url, label: `图片${i + 1}` })),
  });
}

export function pickMention(page: VisibleEditor, index: number) {
  const snap = choosing.get(page);
  cancelMention(page);
  if (!snap || !page.visible || page.destroyed || page.data.prompt !== snap.text) return;
  const ids = imagesOf(page).map((a) => a.id);
  if (ids.join() !== snap.ids.join() || index < 0 || index >= ids.length) return;
  insertMention(page, snap.text, snap.cursor, index + 1);
}

// Inserts "图片N " right after an "@" that already sits before `cursor`.
export function insertMention(page: VisibleEditor, text: string, cursor: number, number: number) {
  const token = `图片${number} `;
  const prompt = text.slice(0, cursor) + token + text.slice(cursor);
  if (Array.from(prompt).length > page.data.maxPromptChars) {
    wx.showToast({ title: "引用后超出字数限制", icon: "none" });
    return false;
  }
  page.setData({ prompt, hasPrompt: true, promptCursor: cursor + token.length });
  return true;
}

// Appends a mention at the end of the prompt (used from the image viewer).
export function appendMention(page: VisibleEditor, number: number) {
  const base = page.data.prompt;
  const text = base + (base && !/\s$/.test(base) ? " @" : "@");
  return insertMention(page, text, text.length, number);
}

export function clearMentions(text: string) {
  return text.replace(/@图片\d+/g, "");
}

// Image numbers always follow their current order in the attachment strip.
export function removeMention(text: string, number: number) {
  return text.replace(/@图片(\d+)(?!\d)/g, (token, raw) => {
    const index = Number(raw);
    return index === number ? "" : index > number ? `@图片${index - 1}` : token;
  });
}
