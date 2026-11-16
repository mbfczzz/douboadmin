import { TAB_ITEMS, tabTarget, tabIndexOf, switchInPlace } from "../utils/tab-transition";

Component({
  data: {
    selected: 0,
    switching: false,
    items: TAB_ITEMS,
  },
  pageLifetimes: {
    show() {
      this.syncSelected();
    },
  },
  lifetimes: {
    attached() {
      this.syncSelected();
    },
  },
  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const route = pages[pages.length - 1]?.route;
      const index = route ? tabIndexOf(route) : -1;
      if (index >= 0) this.setData({ selected: index, switching: false });
      else this.setData({ switching: false });
    },
    switchTab(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.index);
      if (
        this.data.switching ||
        i === this.data.selected ||
        !this.data.items[i]
      )
        return;
      this.setData({ switching: true });
      const fail = () => {
        this.setData({ switching: false });
        wx.showToast({ title: "切换失败，请重试", icon: "none" });
      };
      try {
        // 模板 and 优秀 share one tab page: on it, only its view changes.
        const url = tabTarget(this.data.items[i].path);
        if (switchInPlace(url)) {
          this.setData({ selected: i, switching: false });
          return;
        }
        wx.switchTab({ url, fail, complete: () => this.setData({ switching: false }) });
      } catch {
        fail();
      }
    },
  },
});
