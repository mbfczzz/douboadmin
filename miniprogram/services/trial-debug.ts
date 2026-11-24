// Trial builds default to debug on every cold launch, before network requests.
// Release/develop keep the existing manual five-tap switch in Settings.
const KEY = "debug-console";
const AUTO = "trial-debug-default";
let ready: Promise<void> | undefined;

function isTrial() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion === "trial"; }
  catch { return false; }
}

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

// An automatic trial preference must not keep the console on in release.
export function clearLegacyDebug() {
  if (isTrial()) return;
  try {
    const automatic = wx.getStorageSync(AUTO) === true;
    if (!automatic && wx.getStorageSync(KEY) !== "") return;
    wx.setStorageSync(KEY, false);
    wx.setStorageSync(AUTO, false);
    wx.setEnableDebug({ enableDebug: false });
  } catch { /* unsupported on this base library */ }
}

export function initializeDebug(): Promise<void> {
  if (!isTrial()) {
    clearLegacyDebug();
    return Promise.resolve();
  }
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ok) {
        reject(new Error("体验版调试开启失败，请关闭小程序后重试"));
        return;
      }
      try {
        wx.setStorageSync(KEY, true);
        wx.setStorageSync(AUTO, true);
      } catch { /* Debug can work even when local storage is unavailable. */ }
      resolve();
    };
    const timer = setTimeout(() => finish(false), 5000);
    try {
      wx.setEnableDebug({
        enableDebug: true,
        success: () => finish(true),
        fail: () => finish(false),
      });
    } catch { finish(false); }
  }).catch((error: Error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

// Concurrent startup calls share one enable operation; failures permit retry.
export function trialDebug<T>(send: () => Promise<T>): Promise<T> {
  return isTrial() ? initializeDebug().then(send) : send();
}
