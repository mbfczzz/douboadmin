Component({
  options: { multipleSlots: true },
  properties: {
    title: { type: String, value: "" },
    size: { type: Number, value: 20 },
    back: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    interceptBack: { type: Boolean, value: false },
  },
  data: { top: 24, height: 44, actionsRight: 88, backing: false },
  pageLifetimes: {
    resize() {
      this.measure();
    },
    show() {
      this.setData({ backing: false });
    },
  },
  lifetimes: {
    attached() {
      this.measure();
    },
  },
  methods: {
    measure() {
      const info = wx.getWindowInfo();
      const capsule = wx.getMenuButtonBoundingClientRect();
      const top = Math.max(0, info.statusBarHeight ?? 24);
      const valid =
        capsule.height > 0 && capsule.top >= top && capsule.left > 0;
      this.setData({
        top,
        height: valid
          ? Math.max(44, capsule.height + (capsule.top - top) * 2)
          : 44,
        actionsRight: valid
          ? Math.max(0, info.windowWidth - capsule.left + 8)
          : 88,
      });
    },
    goBack() {
      if (this.data.disabled || this.data.backing) return;
      if (this.data.interceptBack) {
        this.triggerEvent("back");
        return;
      }
      this.setData({ backing: true });
      wx.navigateBack({
        fail: () =>
          wx.switchTab({
            url: "/pages/templates/index",
            fail: () => {
              this.setData({ backing: false });
              wx.showToast({ title: "返回失败，请重试", icon: "none" });
            },
          }),
      });
    },
  },
});
