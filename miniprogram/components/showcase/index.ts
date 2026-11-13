import { openPage } from "../../utils/navigation";
import { templateCovers as covers } from "../../services/covers";
import type { Cover } from "../../services/covers";

// Real template covers instead of icons: "fan" (empty states) shows three
// fanned out; "strip" scrolls through six with titles. Tapping opens that
// template ("做同款").
Component({
  properties: { mode: { type: String, value: "fan" } },
  data: { covers: [] as Cover[], placeholders: [{}, {}, {}] }, // grey cards until covers load
  lifetimes: {
    attached() {
      void covers().then((list) =>
        this.setData({ covers: this.data.mode === "strip" ? list : list.slice(0, 3) }),
      );
    },
  },
  methods: {
    open(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string;
      if (id) openPage(this, { url: "/pages/template-detail/index?id=" + id });
    },
  },
});
