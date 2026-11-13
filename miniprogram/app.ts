import { clearLegacyDebug } from "./services/trial-debug";
import { loadConfig } from "./utils/config-cache";
import { captureInvite } from "./services/invitation";
import { enforceAccess } from "./services/access";
import { pauseVisit, resumeVisit } from "./services/analytics";
App({
  globalData: {},
  onShow(options) {
    captureInvite(options.query);
    resumeVisit(options.scene);
    void enforceAccess(options.path || "pages/activate/index");
  },
  onHide: pauseVisit,
  onLaunch() {
    clearLegacyDebug();
    // Warm the shared config so the first tab paints without waiting on it.
    void loadConfig().catch(() => undefined);
    wx.setBackgroundColor({
      backgroundColor: "#0f0f11",
      backgroundColorTop: "#0f0f11",
      backgroundColorBottom: "#0f0f11",
    });
  },
});
