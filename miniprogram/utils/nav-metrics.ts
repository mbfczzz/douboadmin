// The custom nav bar's geometry (status bar + title row, beside the WeChat
// capsule). The nav-bar component draws with it; pages use navBottom() to
// pin content right below the bar.
export function navMetrics() {
  const info = wx.getWindowInfo();
  const capsule = wx.getMenuButtonBoundingClientRect();
  const top = Math.max(0, info.statusBarHeight ?? 24);
  const valid = capsule.height > 0 && capsule.top >= top && capsule.left > 0;
  return {
    top,
    height: valid ? Math.max(44, capsule.height + (capsule.top - top) * 2) : 44,
    actionsRight: valid ? Math.max(0, info.windowWidth - capsule.left + 8) : 88,
  };
}

export function navBottom() {
  const { top, height } = navMetrics();
  return top + height;
}
