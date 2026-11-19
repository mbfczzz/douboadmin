import { toHtml, fromDelta, caretAfter } from "../../utils/prompt-delta";

type Ctx = { setContents(o: object): void; blur(o?: object): void };
type Self = { ctx?: Ctx; shown: string; refs: unknown; keyboard?: (r: { height: number }) => void };

// The create prompt box: @图片N / @视频N show as inline thumbnails, while
// `value` (and every "input" event) stays the plain prompt text. Emits
// input {value, cursor}, focus, blur and keyboard {height}, like a textarea.
Component({
  properties: {
    value: { type: String, value: "" },
    assets: { type: Array, value: [] },
    placeholder: { type: String, value: "" },
    max: { type: Number, value: 2000 },
  },
  data: {},
  observers: {
    // Outside changes (a pick, a draft, a removed reference) are redrawn;
    // the text the user just typed is not.
    "value, assets"(value: string, assets: unknown) {
      const s = this.self();
      if (value !== s.shown || assets !== s.refs) this.render();
    },
  },
  lifetimes: {
    detached() {
      this.listen(false);
    },
  },
  methods: {
    self() {
      return this as unknown as Self;
    },
    ready() {
      this.createSelectorQuery().select("#editor").context((res: { context: unknown }) => {
        this.self().ctx = (res as { context: Ctx }).context;
        this.render();
      }).exec();
    },
    render() {
      const s = this.self();
      s.shown = this.data.value;
      s.refs = this.data.assets;
      s.ctx?.setContents({ html: toHtml(this.data.value, this.data.assets as never[]) });
    },
    input(e: WechatMiniprogram.CustomEvent<{ delta?: { ops?: object[] } }>) {
      const s = this.self(), before = s.shown || "";
      const value = fromDelta(e.detail.delta?.ops || [], this.data.assets as never[]);
      if (value === before) return;
      if (Array.from(value).length > this.data.max) {
        this.render(); // back to the last allowed text
        wx.showToast({ title: `最多 ${this.data.max} 字`, icon: "none" });
        return;
      }
      s.shown = value;
      this.triggerEvent("input", { value, cursor: caretAfter(before, value) });
    },
    focus() {
      this.listen(true);
      this.triggerEvent("focus");
    },
    blur() {
      this.triggerEvent("blur");
    },
    // Closes the keyboard (the @ picker then opens with room to tap).
    close() {
      this.self().ctx?.blur();
    },
    listen(on: boolean) {
      const s = this.self();
      if (s.keyboard) wx.offKeyboardHeightChange?.(s.keyboard);
      s.keyboard = undefined;
      if (!on || typeof wx.onKeyboardHeightChange !== "function") return;
      s.keyboard = (r: { height: number }) => {
        this.triggerEvent("keyboard", { height: r.height });
        if (!r.height) this.listen(false);
      };
      wx.onKeyboardHeightChange(s.keyboard);
    },
  },
});
