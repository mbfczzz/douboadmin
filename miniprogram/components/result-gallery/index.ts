Component({
  properties: {
    images: { type: Array, value: [] },
    allowSave: { type: Boolean, value: false },
    busy: { type: Boolean, value: false },
  },
  methods: {
    preview(e: WechatMiniprogram.TouchEvent) {
      this.triggerEvent("preview", { index: Number(e.currentTarget.dataset.index) });
    },
    save(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.busy) this.triggerEvent("save", { index: Number(e.currentTarget.dataset.index) });
    },
  },
});
