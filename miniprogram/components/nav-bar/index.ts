import { navMetrics } from "../../utils/nav-metrics";
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
      this.setData(navMetrics());
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
