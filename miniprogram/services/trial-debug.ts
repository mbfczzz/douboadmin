// The on-screen debug console (vConsole) is opt-in: it records every request
// and render and visibly slows the app, so it never turns on by itself.
// Tapping 当前版本 five times in 设置 flips it; requests never wait for it.
const KEY = "debug-console";

export function debugEnabled() {
  try {
    return wx.getStorageSync(KEY) === true;
  } catch {
    return false;
  }
}

export function setDebug(on: boolean) {
  wx.setStorageSync(KEY, on);
  try {
    wx.setEnableDebug({ enableDebug: on });
  } catch {
    // unsupported on this base library
  }
}

// Earlier builds switched the console on for every trial launch, and WeChat
// keeps that switch on the device. Once per device, if nobody chose it here,
// switch it back off; after that only the five-tap toggle changes it.
export function clearLegacyDebug() {
  try {
    if (wx.getStorageSync(KEY) !== "") return;
    wx.setStorageSync(KEY, false);
    wx.setEnableDebug({ enableDebug: false });
  } catch {
    // unsupported on this base library
  }
}

// Kept as a pass-through so callers stay unchanged; it no longer delays.
export function trialDebug<T>(send: () => Promise<T>): Promise<T> {
  return send();
}
