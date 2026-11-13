export type DialogOptions = {
  title: string;
  content?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  tone?: "primary" | "danger";
  icon?: string;
  amount?: string; // a large figure under the title, e.g. "120"
  unit?: string; // its unit, e.g. "积分"
};
type Dialog = { open(options: DialogOptions): Promise<boolean> };

// Opens the themed <ui-dialog id="ui-dialog" /> on the current page and
// resolves true on confirm. Pages without one fall back to wx.showModal.
export function ask(options: DialogOptions): Promise<boolean> {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const page = pages[pages.length - 1] as { selectComponent?(id: string): unknown } | undefined;
  const dialog = page?.selectComponent?.("#ui-dialog") as Dialog | null | undefined;
  if (dialog && typeof dialog.open === "function") return dialog.open(options);
  const text = [options.amount && `${options.amount} ${options.unit || ""}`.trim(), options.content]
    .filter(Boolean)
    .join("\n");
  return new Promise((resolve) => {
    const result = wx.showModal({
      title: options.title,
      content: text,
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      showCancel: options.showCancel !== false,
      ...(options.tone === "danger" ? { confirmColor: "#b42338" } : {}),
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    }) as unknown;
    if (result && typeof (result as Promise<unknown>).then === "function")
      (result as Promise<{ confirm?: boolean }>).then((r) => resolve(!!r?.confirm), () => resolve(false));
  });
}
