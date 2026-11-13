// Pull-to-refresh: reload the page's data, then always fold the spinner away.
export async function pullRefresh(load: () => Promise<unknown>) {
  try {
    await load();
  } catch {
    // the page's own load already reports errors
  } finally {
    wx.stopPullDownRefresh?.();
  }
}
