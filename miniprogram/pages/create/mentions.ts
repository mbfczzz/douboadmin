import type { VisibleEditor } from "./editor-types";

const choosing = new WeakMap<object, object>();

export function cancelMention(page: object) {
  choosing.delete(page);
}

export function chooseMention(page: VisibleEditor, cursor: number) {
  const text = page.data.prompt;
  if (text[cursor - 1] !== "@" || choosing.has(page) || page.data.busy) return;
  const images = page.data.assets.filter((asset) => asset.isImage);
  if (!images.length) {
    wx.showToast({ title: "请先添加参考图片", icon: "none" });
    return;
  }
  const ticket = {};
  choosing.set(page, ticket);
  const finish = () => {
    if (choosing.get(page) === ticket) choosing.delete(page);
  };
  const current = () =>
    choosing.get(page) === ticket &&
    page.visible &&
    !page.destroyed &&
    page.data.prompt === text;
  function show(offset: number) {
    const batch = images.slice(offset, offset + 5);
    const more = images.length > 5;
    try {
      wx.showActionSheet({
        itemList: [
          ...batch.map(
            (asset, i) =>
              `图片${offset + i + 1} · ${asset.data.name || "参考图"}`,
          ),
          ...(more ? ["更多图片…"] : []),
        ],
        success(result) {
          if (!current()) {
            finish();
            return;
          }
          if (more && result.tapIndex === batch.length) {
            show(offset + 5 >= images.length ? 0 : offset + 5);
            return;
          }
          const asset = batch[result.tapIndex];
          const now = page.data.assets.filter((row) => row.isImage);
          finish();
          if (
            !asset ||
            now.length !== images.length ||
            now.some((row, i) => row.id !== images[i].id)
          )
            return;
          const token = `图片${offset + result.tapIndex + 1} `;
          const prompt = text.slice(0, cursor) + token + text.slice(cursor);
          if (Array.from(prompt).length > page.data.maxPromptChars) {
            wx.showToast({ title: "引用后超出字数限制", icon: "none" });
            return;
          }
          page.setData({
            prompt,
            hasPrompt: true,
            promptCursor: cursor + token.length,
          });
        },
        fail() {
          finish();
        },
      });
    } catch {
      finish();
      if (page.visible && !page.destroyed)
        wx.showToast({ title: "暂时无法选择参考图，请重试", icon: "none" });
    }
  }
  show(0);
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
