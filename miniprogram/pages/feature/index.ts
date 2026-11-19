import { enterPage } from "../../utils/api";
import { CONFIGS } from "./configs";
import type { Section } from "./configs";

// Interface-first feature page (see configs.ts). Choices work locally so the
// layout can be tried; uploading and the final action say it is coming.
type View = Section & { value?: string; picks?: { label: string; on: boolean }[] };

function views(sections: Section[]): View[] {
  return sections.map((s) =>
    s.type === "chips" || s.type === "tabs"
      ? { ...s, picks: s.values.map((label, i) => ({ label, on: i === 0 })) }
      : s.type === "text" ? { ...s, value: "" } : s,
  );
}
const soon = () => wx.showToast({ title: "该功能即将开放", icon: "none" });

Page({
  data: { title: "", action: "", tab: 0, sections: [] as View[] },
  onLoad(query: Record<string, string>) {
    const config = CONFIGS[query.key] || CONFIGS.avatar;
    this.setData({ title: config.title, action: config.action, sections: views(config.sections) });
  },
  onShow() {
    enterPage(this);
  },
  pick(e: WechatMiniprogram.TouchEvent) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    const s = this.data.sections[section] as View | undefined;
    if (!s?.picks) return;
    const multi = s.type === "chips" && s.multi;
    const picks = s.picks.map((p: { label: string; on: boolean }, i: number) => ({ ...p, on: multi ? (i === index ? !p.on : p.on) : i === index }));
    this.setData({ [`sections[${section}].picks`]: picks, ...(s.type === "tabs" ? { tab: Number(index) } : {}) });
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ [`sections[${e.currentTarget.dataset.section}].value`]: e.detail.value });
  },
  upload: soon,
  row: soon,
  start: soon,
});
