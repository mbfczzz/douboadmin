import { captureInvite } from "./services/invitation";
import { enforceAccess } from "./services/access";
import { pauseVisit, resumeVisit } from "./services/analytics";
import { trialDebug } from "./services/trial-debug";
App({
  globalData: {},
  onShow(options) {
    captureInvite(options.query);
    resumeVisit(options.scene);
    void enforceAccess(options.path || "pages/activate/index");
  },
  onHide: pauseVisit,
  onLaunch() {
    void trialDebug(() => Promise.resolve());
    wx.setBackgroundColor({
      backgroundColor: "#0f0f11",
      backgroundColorTop: "#0f0f11",
      backgroundColorBottom: "#0f0f11",
    });
  },
});
