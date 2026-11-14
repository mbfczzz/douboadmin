import { showArt } from "../../utils/ui-art";
import type { Art } from "../../utils/ui-art";

// A themed photograph behind the top of a 我的 subpage, fading into the page
// colour. Place it first inside a `.subpage.has-backdrop` container; the
// picture sits under every card and line of text. No picture, no element.
type Self = { gone?: boolean; data: { src: string }; setData(data: Record<string, unknown>): void };

Component({
  properties: { name: { type: String, value: "" } },
  data: { src: "", ready: false },
  // attached covers a fixed name, the observer one that changes later.
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
    loaded() {
      if (!this.data.ready) this.setData({ ready: true });
    },
    show(name: string) {
      if (!name) return;
      const self = this as unknown as Self;
      // Late answers after the page closed, or the same picture again, are dropped.
      const target = { setData: (d: Record<string, unknown>) => !self.gone && d.src !== self.data.src && self.setData(d) };
      showArt(target, (art) => ({ src: art[name as keyof Art] || "" }));
    },
  },
});
