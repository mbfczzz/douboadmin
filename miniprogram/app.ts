import { initializeDebug } from "./services/trial-debug";
import { loadConfig } from "./utils/config-cache";
import { captureInvite } from "./services/invitation";
import { enforceAccess } from "./services/access";
import { pauseVisit, resumeVisit } from "./services/analytics";
App({
  onShow(options) {
    captureInvite(options.query);
    resumeVisit(options.scene);
    void enforceAccess(options.path || "pages/activate/index");
  },
  onHide: pauseVisit,
  onLaunch() {
    const update = wx.getUpdateManager?.();
    update?.onUpdateReady(() => wx.showModal({ title: "版本更新", content: "新版本已就绪，是否立即更新？", confirmText: "立即更新", success: (r) => r.confirm && update.applyUpdate() }));
    void initializeDebug().catch(() => undefined);
    void loadConfig().catch(() => undefined);
    wx.setBackgroundColor({
      backgroundColor: "#0f0f11",
      backgroundColorTop: "#0f0f11",
      backgroundColorBottom: "#0f0f11",
    });
  },
});
