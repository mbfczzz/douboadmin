import { TAB_ITEMS } from "../utils/tab-transition";

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
      const index = this.data.items.findIndex((item: { path: string }) => item.path === "/" + route);
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
        wx.switchTab({
          url: this.data.items[i].path,
          fail,
          complete: () => this.setData({ switching: false }),
        });
      } catch {
        fail();
      }
    },
  },
});
