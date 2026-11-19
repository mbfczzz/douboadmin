import type { VisibleEditor } from "./editor-types";
import { pickMention, appendMention, cancelMention } from "./mentions";
import { openReferencePreview, closeViewer } from "./reference-preview";
import { positionMention } from "./mention-position";

type Editor = VisibleEditor & { removeAsset(id: string): void };
type Tap = WechatMiniprogram.TouchEvent;
type Detail = WechatMiniprogram.CustomEvent<{ id: string }>;
const imageNumber = (page: Editor, id: string) =>
  page.data.assets.filter((a) => a.isImage).findIndex((a) => a.id === id) + 1;

// Handlers for the @ picker sheet and the reference viewer, spread into
// the create page so the page file keeps to layout and form logic.
export const referenceHandlers = {
  onPageScroll(this: Editor) { if (this.data.mentionOpen) positionMention(this); },
  holdMentionTap() {},
  focusPrompt(this: Editor) { this.setData({ promptFocus: true }); },
  // The read-only view (with reference chips) turns back into the input.
  editPrompt(this: Editor) { this.setData({ promptFocus: true, promptCursor: this.data.prompt.length }); },
  blurPrompt(this: Editor) { this.setData({ promptFocus: false }); },
  promptKeyboard(this: Editor, e: WechatMiniprogram.CustomEvent<{ height: number }>) {
    this.setData({ keyboardHeight: Math.max(0, e.detail.height) });
    if (!e.detail.height) { cancelMention(this); this.setData({ promptFocus: false }); }
    else if (this.data.mentionOpen) positionMention(this);
  },
  // Images open the in-page viewer (引用 / 删除); videos play full screen.
  previewReference(this: Editor, e: Tap) {
    const asset = this.data.assets.find((a) => a.id === e.currentTarget.dataset.id);
    if (asset?.isVideo) wx.previewMedia({ sources: [{ url: asset.data.url, type: "video", poster: asset.data.thumbnailUrl || undefined }], fail() {} });
    else void openReferencePreview(this, e.currentTarget.dataset.id);
  },
  pickMention(this: Editor, e: Tap) {
    pickMention(this, Number(e.currentTarget.dataset.index));
  },
  closeMention(this: Editor) {
    cancelMention(this);
  },
  closeViewer(this: Editor) {
    closeViewer(this);
  },
  viewerMention(this: Editor, e: Detail) {
    const number = imageNumber(this, e.detail.id);
    if (number && appendMention(this, "图片" + number)) {
      closeViewer(this);
      wx.showToast({ title: `已引用图片${number}`, icon: "none" });
    }
  },
  viewerRemove(this: Editor, e: Detail) {
    closeViewer(this);
    this.removeAsset(e.detail.id);
  },
};
