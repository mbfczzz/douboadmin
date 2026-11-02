import { TAB_ITEMS } from "../utils/tab-transition";

Component({
  data: {
    selected: 0,
    switching: false,
    items: TAB_ITEMS,
  },
  pageLifetimes: {
    show() {
      this.setData({ switching: false });
    },
  },
  methods: {
    switchTab(e: WechatMiniprogram.TouchEvent) {
      const i = Number(e.currentTarget.dataset.index);
      if (
        this.data.switching ||
        i === this.data.selected ||
        !this.data.items[i]
      )
        return;
      this.setData({ switching: true });
      wx.switchTab({
        url: this.data.items[i].path,
        success: () => this.setData({ selected: i }),
        fail: () => wx.showToast({ title: "切换失败，请重试", icon: "none" }),
        complete: () => this.setData({ switching: false }),
      });
    },
  },
});
