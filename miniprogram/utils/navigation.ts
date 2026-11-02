type RouteKind = "navigateBack" | "switchTab";

const departing = new WeakSet<object>();

export function isNavigating(page: object) {
  return departing.has(page);
}

export function resetNavigation(page: object) {
  departing.delete(page);
}

// Keep the native page transition; block a second push until the source returns.
export function openPage(
  page: object,
  options: WechatMiniprogram.NavigateToOption,
) {
  if (departing.has(page)) return false;
  departing.add(page);
  const fail = (reason: WechatMiniprogram.GeneralCallbackResult) => {
    departing.delete(page);
    if (options.fail) options.fail(reason);
    else wx.showToast({ title: "页面打开失败，请重试", icon: "none" });
  };
  try {
    wx.navigateTo({ ...options, fail });
  } catch {
    fail({ errMsg: "navigateTo:fail" });
  }
  return true;
}

function transition(kind: RouteKind, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false,
      succeeded = false,
      routeDone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canObserve =
      typeof wx.onAppRouteDone === "function" &&
      typeof wx.offAppRouteDone === "function";
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (canObserve) wx.offAppRouteDone(onDone);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const onDone: WechatMiniprogram.OnAppRouteDoneCallback = (event) => {
      if (event.openType !== kind) return;
      if (path && event.path?.replace(/^\//, "") !== path.replace(/^\//, ""))
        return;
      routeDone = true;
      if (succeeded) finish();
    };
    const success = () => {
      succeeded = true;
      if (routeDone) finish();
      // Older clients may not dispatch the route-complete event.
      else timer = setTimeout(finish, canObserve ? 650 : 260);
    };
    const fail = (reason: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(reason);
    };
    if (canObserve) wx.onAppRouteDone(onDone);
    try {
      if (kind === "navigateBack") wx.navigateBack({ success, fail });
      else wx.switchTab({ url: path, success, fail });
    } catch (e) {
      fail(e);
    }
  });
}

export async function returnAfterTransition(fallback: string) {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const previous = pages.length > 1 ? pages[pages.length - 2].route : "";
  try {
    await transition("navigateBack", previous);
  } catch {
    await transition("switchTab", fallback);
  }
}
