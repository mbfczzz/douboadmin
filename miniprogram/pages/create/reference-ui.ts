import type { VisibleEditor } from "./editor-types";
import { pickMention, appendMention, cancelMention } from "./mentions";
import { openReferencePreview, closeViewer } from "./reference-preview";

type Editor = VisibleEditor & { removeAsset(id: string): void };
type Tap = WechatMiniprogram.TouchEvent;
type Detail = WechatMiniprogram.CustomEvent<{ id: string }>;
const imageNumber = (page: Editor, id: string) =>
  page.data.assets.filter((a) => a.isImage).findIndex((a) => a.id === id) + 1;

// Handlers for the @ picker sheet and the reference viewer, spread into
// the create page so the page file keeps to layout and form logic.
export const referenceHandlers = {
  previewReference(this: Editor, e: Tap) {
    void openReferencePreview(this, e.currentTarget.dataset.id);
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
    if (number && appendMention(this, number)) {
      closeViewer(this);
      wx.showToast({ title: `已引用图片${number}`, icon: "none" });
    }
  },
  viewerRemove(this: Editor, e: Detail) {
    closeViewer(this);
    this.removeAsset(e.detail.id);
  },
};
