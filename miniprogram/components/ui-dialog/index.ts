import type { DialogOptions } from "../../services/dialog";

// The app's own confirm dialog: dark card, optional tone icon and amount,
// pill actions. Pages mount one <ui-dialog id="ui-dialog" />; utils/dialog
// opens it and resolves true only on the confirm action.
Component({
  data: {
    visible: false,
    title: "",
    content: "",
    confirmText: "确定",
    cancelText: "取消",
    showCancel: true,
    tone: "primary",
    icon: "",
    amount: "",
    unit: "",
  },
  methods: {
    open(options: DialogOptions): Promise<boolean> {
      this.settle(false);
      this.setData({
        visible: true,
        title: options.title || "",
        content: options.content || "",
        confirmText: options.confirmText || "确定",
        cancelText: options.cancelText || "取消",
        showCancel: options.showCancel !== false,
        tone: options.tone || "primary",
        icon: options.icon || (options.tone === "danger" ? "error-circle" : ""),
        amount: options.amount || "",
        unit: options.unit || "",
      });
      return new Promise((resolve) => {
        (this as unknown as { resolver?: (v: boolean) => void }).resolver = resolve;
      });
    },
    settle(value: boolean) {
      const self = this as unknown as { resolver?: (v: boolean) => void };
      const resolve = self.resolver;
      self.resolver = undefined;
      if (this.data.visible) this.setData({ visible: false });
      resolve?.(value);
    },
    confirm() {
      this.settle(true);
    },
    cancel() {
      this.settle(false);
    },
    mask() {
      if (this.data.showCancel) this.settle(false);
    },
    hold() {},
  },
  lifetimes: {
    detached() {
      this.settle(false);
    },
  },
});
