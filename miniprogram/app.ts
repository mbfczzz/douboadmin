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
      backgroundColor: "#101113",
      backgroundColorTop: "#101113",
      backgroundColorBottom: "#101113",
    });
  },
});
