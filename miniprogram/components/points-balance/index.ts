import { request } from "../../services/request";
import { hasSession } from "../../services/session";
import { points } from "../../services/business";
import { canRecharge } from "../../services/payment";
import type { WalletInfo } from "../../services/business";
import { openPage, resetNavigation } from "../../utils/navigation";

Component({
  data: {
    logged: false,
    loaded: false,
    available: "—",
    held: "0",
    loadError: "",
    rechargeEnabled: false,
  },
  lifetimes: {
    attached() {
      this.start();
    },
    detached() {
      this.stop();
    },
  },
  pageLifetimes: {
    show() {
      resetNavigation(this);
      this.start();
    },
    hide() {
      this.stop();
    },
  },
  methods: {
    start() {
      if (this._visible) return;
      this.stop();
      this._visible = true;
      void this.reload();
    },
    stop() {
      this._visible = false;
      this._revision = (this._revision || 0) + 1;
      clearTimeout(this._timer);
    },
    async reload() {
      clearTimeout(this._timer);
      const revision = (this._revision = (this._revision || 0) + 1);
      if (!hasSession()) {
        this.setData({
          logged: false,
          loaded: false,
          available: "—",
          held: "0",
          loadError: "",
        });
        return;
      }
      this.setData({ logged: true });
      let delay = 15000;
      try {
        const info = await request<WalletInfo>(
          "/wallet",
          "GET",
          undefined,
          undefined,
          false,
        );
        if (revision !== this._revision) return;
        this.setData({
          loaded: true,
          available: points(info.wallet.availableUnits),
          held: points(info.wallet.heldUnits),
          // Same rule as the wallet page (channel, platform, pricing).
          rechargeEnabled: canRecharge(info),
          loadError: "",
        });
        if (info.wallet.heldUnits > 0) delay = 3000;
      } catch {
        if (revision !== this._revision) return;
        this.setData({
          loadError: "积分暂时无法刷新，点击重试",
          logged: hasSession(),
        });
      } finally {
        if (this._visible && revision === this._revision && hasSession())
          this._timer = setTimeout(() => void this.reload(), delay);
      }
    },
    openWallet() {
      openPage(this, { url: "/pages/wallet/index" });
    },
  },
});
