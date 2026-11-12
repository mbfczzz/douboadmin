import { enforceAccess } from "./services/access";
import { pauseVisit, resumeVisit } from "./services/analytics";
import { trialDebug } from "./services/trial-debug";
App({
  globalData: {},
  onShow(options) {
    resumeVisit(options.scene);
    void enforceAccess(options.path || "pages/activate/index");
  },
  onHide: pauseVisit,
  onLaunch() {
    void trialDebug(() => Promise.resolve());
    wx.setBackgroundColor({
      backgroundColor: "#f4f6f8",
      backgroundColorTop: "#f4f6f8",
      backgroundColorBottom: "#f4f6f8",
    });
  },
});
