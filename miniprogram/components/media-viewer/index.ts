type Item = { id: string; url: string; label: string };

// Full-screen dark viewer for uploaded references: swipe between images,
// tap the picture to close, and act on the visible one with icon actions.
Component({
  properties: {
    show: { type: Boolean, value: false },
    items: { type: Array, value: [] as Item[] },
    current: { type: Number, value: 0 },
  },
  data: { index: 0 },
  observers: {
    "show, current"(show: boolean, current: number) {
      if (show) this.setData({ index: current });
    },
  },
  methods: {
    swipe(e: WechatMiniprogram.SwiperChange) {
      this.setData({ index: e.detail.current });
    },
    close() {
      this.triggerEvent("close");
    },
    item() {
      return (this.data.items as Item[])[this.data.index];
    },
    mention() {
      const item = this.item();
      if (item) this.triggerEvent("mention", { id: item.id });
    },
    remove() {
      const item = this.item();
      if (item) this.triggerEvent("remove", { id: item.id });
    },
    hold() {}, // swallow taps on the bars so they do not close the viewer
  },
});
