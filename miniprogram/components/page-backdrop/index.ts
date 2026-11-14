import { showArt } from "../../utils/ui-art";
import type { Art } from "../../utils/ui-art";

// A themed photograph behind the top of a 我的 subpage, fading into the page
// colour. Place it first inside a `.subpage.has-backdrop` container; the
// picture sits under every card and line of text. No picture, no element.
Component({
  properties: { name: { type: String, value: "" } },
  data: { src: "", ready: false },
  // attached covers a fixed name, the observer one that changes later.
  lifetimes: {
    attached() {
      this.show(this.data.name);
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
      if (name) showArt(this, (art) => ({ src: art[name as keyof Art] || "" }));
    },
  },
});
