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
      backgroundColor: "#121212",
      backgroundColorTop: "#121212",
      backgroundColorBottom: "#121212",
    });
  },
});
