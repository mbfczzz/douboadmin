import { showArt } from "../../utils/ui-art";
import type { Art } from "../../utils/ui-art";

// A Codex 3D icon (media/ui-art, a full-bleed tile rounded here) in place of
// a plain glyph. Until the picture is there (first load, no OSS) the bundled
// glyph, or the TDesign icon, shows instead, so the spot is never empty.
type Self = { gone?: boolean; data: { src: string }; setData(data: Record<string, unknown>): void };

Component({
  options: { virtualHost: true },
  properties: {
    name: { type: String, value: "" }, // key in utils/ui-art NAMES
    size: { type: Number, value: 20 },
    glyph: { type: String, value: "" }, // fallback PNG
    icon: { type: String, value: "" }, // fallback TDesign icon
    fallbackSize: { type: Number, value: 0 }, // the fallback's size when it sat in a tile (0 = size)
  },
  data: { src: "" },
  lifetimes: {
    attached() {
      this.show(this.data.name);
    },
    detached() {
      (this as unknown as Self).gone = true;
    },
  },
  observers: {
    name(name: string) {
      this.show(name);
    },
  },
  methods: {
    show(name: string) {
      if (!name) return;
      const self = this as unknown as Self;
      const target = { setData: (d: Record<string, unknown>) => !self.gone && d.src !== self.data.src && self.setData(d) };
      showArt(target, (art) => ({ src: art[name as keyof Art] || "" }));
    },
  },
});
