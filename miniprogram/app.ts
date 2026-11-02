import { enforceAccess } from "./services/access";
App({
  globalData: {},
  onShow(options) {
    void enforceAccess(options.path || "pages/activate/index");
  },
  onLaunch() {
    wx.setBackgroundColor({
      backgroundColor: "#131516",
      backgroundColorTop: "#131516",
      backgroundColorBottom: "#131516",
    });
  },
});
