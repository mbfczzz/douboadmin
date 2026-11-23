function productionConnected() {
  try {
    const version = wx.getAccountInfoSync().miniProgram.envVersion;
    return version === "trial" || version === "release";
  } catch {
    return false;
  }
}

export const API_BASE = productionConnected() ? "https://mbygkj.com" : "http://106.15.92.153:8088";
