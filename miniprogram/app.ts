import { enforceAccess } from "./services/access";
import { pauseVisit, resumeVisit } from "./services/analytics";
App({
  globalData: {},
  onShow(options) {
    resumeVisit(options.scene);
    void enforceAccess(options.path || "pages/activate/index");
  },
  onHide: pauseVisit,
  onLaunch() {
    wx.setBackgroundColor({
      backgroundColor: "#131516",
      backgroundColorTop: "#131516",
      backgroundColorBottom: "#131516",
    });
  },
});
