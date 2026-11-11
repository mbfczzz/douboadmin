let ready: Promise<void> | undefined;
let checked = false;
export function trialDebug<T>(send: () => Promise<T>): Promise<T> {
  if (!checked) {
    checked = true;
    try {
      if (wx.getAccountInfoSync().miniProgram.envVersion === "trial") {
        ready = new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3000);
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          try {
            wx.setEnableDebug({ enableDebug: true, complete: done });
          } catch { done(); }
        });
      }
    } catch { ready = undefined; }
  }
  return ready ? ready.then(send) : send();
}
