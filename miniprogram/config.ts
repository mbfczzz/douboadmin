function released() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion === "release";
  } catch {
    return false;
  }
}

export const API_BASE = released() ? "https://mbygkj.com" : "http://106.15.92.153:8088";
