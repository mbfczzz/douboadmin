import { setFeatured } from "../../utils/featured-mode";
import { TEMPLATES_TAB_PATH } from "../../utils/tab-transition";

// Old address: 优秀作品 now lives in the 模板 tab page.
Page({
  data: {},
  onLoad() {
    setFeatured(true);
    wx.switchTab({ url: TEMPLATES_TAB_PATH });
  },
});
