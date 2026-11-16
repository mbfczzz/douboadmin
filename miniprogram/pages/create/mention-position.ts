import type { VisibleEditor } from "./editor-types";

type Rect = { left: number; top: number; right: number; bottom: number };
const pending = new WeakMap<object, object>();

export function mentionPosition(anchor: Rect, input: Rect, width: number, bottom: number, count = 3) {
  // 40 px heading + 56 px rows (sheets.wxss).
  const panelWidth = Math.min(248, width - 24), panelHeight = Math.min(210, 42 + Math.max(1, count) * 56, Math.max(98, bottom - 80));
  const y = Math.max(input.top, Math.min(anchor.top, input.bottom - 22));
  const beside = anchor.right + 8 + panelWidth <= width - 12;
  const left = Math.max(12, Math.min(beside ? anchor.right + 8 : anchor.left, width - panelWidth - 12));
  let top = beside ? y : y + 26;
  if (top + panelHeight > bottom - 8) top = y - panelHeight - 4;
  const topInset = Math.min(80, Math.max(8, bottom - panelHeight - 8));
  top = Math.max(topInset, Math.min(top, bottom - panelHeight - 8));
  return `left:${left}px;top:${top}px;width:${panelWidth}px;max-height:${panelHeight}px`;
}

export function positionMention(page: VisibleEditor) {
  const ticket = {};
  pending.set(page, ticket);
  const active = () => pending.get(page) === ticket && page.data.mentionOpen && page.visible && !page.destroyed;
  const measure = () => {
    if (!active()) return;
    const info = wx.getWindowInfo();
    const bottom = info.windowHeight - page.data.keyboardHeight;
    if (typeof wx.createSelectorQuery !== "function") {
      page.setData({ mentionReady: true });
      return;
    }
    wx.createSelectorQuery().select(".mention-caret").boundingClientRect()
      .select(".prompt-input").boundingClientRect().exec((values) => {
        if (!active()) return;
        const anchor = values[0] as Rect | null, input = values[1] as Rect | null;
        if (!input) return;
        page.setData({ mentionStyle: mentionPosition(anchor || input, input, info.windowWidth, bottom, page.data.mentionItems.length), mentionReady: true });
      });
  };
  if (typeof wx.nextTick === "function") wx.nextTick(measure); else measure();
}
