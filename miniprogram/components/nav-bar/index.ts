Component({
  options: { multipleSlots: true },
  properties: {
    title: { type: String, value: "" },
    size: { type: Number, value: 19 },
    back: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
  },
  data: { top: 24, height: 44, actionsRight: 88, backing: false },
  pageLifetimes: {
    show() {
      this.setData({ backing: false });
    },
  },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo();
      const capsule = wx.getMenuButtonBoundingClientRect();
      this.setData({
        top: info.statusBarHeight,
        height: capsule.height + (capsule.top - info.statusBarHeight) * 2,
        actionsRight: info.windowWidth - capsule.left + 8,
      });
    },
  },
  methods: {
    goBack() {
      if (this.data.disabled || this.data.backing) return;
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
