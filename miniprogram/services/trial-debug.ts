// Production-connected trial/review builds never show a debug console by
// default. Settings keeps the existing manual five-tap switch for developers.
const KEY = "debug-console";
const AUTO = "trial-debug-default";

export function debugEnabled() {
  try { return wx.getStorageSync(KEY) === true; }
  catch { return false; }
}

export function setDebug(on: boolean) {
  wx.setStorageSync(KEY, on);
  wx.setStorageSync(AUTO, false);
  try { wx.setEnableDebug({ enableDebug: on }); }
  catch { /* unsupported on this base library */ }
}

// Remove the legacy auto-enabled trial preference without touching a manual one.
export function clearLegacyDebug() {
  try {
    const automatic = wx.getStorageSync(AUTO) === true;
    if (!automatic) return;
    wx.setStorageSync(KEY, false);
    wx.setStorageSync(AUTO, false);
    wx.setEnableDebug({ enableDebug: false });
  } catch { /* unsupported on this base library */ }
}

export function initializeDebug(): Promise<void> {
  clearLegacyDebug();
  return Promise.resolve();
}

export function trialDebug<T>(send: () => Promise<T>): Promise<T> {
  return send();
}
