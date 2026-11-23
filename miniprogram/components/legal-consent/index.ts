Component({
  properties: {
    checked: { type: Boolean, value: false },
  },
  methods: {
    change(event: WechatMiniprogram.CheckboxGroupChange) {
      this.triggerEvent("change", {
        checked: event.detail.value.includes("accepted"),
      });
    },
  },
});
