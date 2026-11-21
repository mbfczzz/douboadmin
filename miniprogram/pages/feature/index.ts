import { enterPage } from "../../utils/api";
import { showArt } from "../../utils/ui-art";
import { CONFIGS } from "./configs";
import type { Section } from "./configs";
import { featureActions } from "./actions";
import type { View } from "./actions";
import { exampleHandlers, loadHotLinks } from "./examples";

// Interface-first feature page (see configs.ts): everything up to the final
// action works (actions.ts); that one checks the inputs, then says it is
// coming.
type Pick = { label: string; on: boolean; art?: string };

function views(sections: Section[]): View[] {
  const text = sections.findIndex((s) => s.type === "text");
  return sections.map((s): View => {
    if (s.type === "chips" || s.type === "tabs") return { ...s, picks: s.values.map((label, i) => ({ label, on: i === 0 })) };
    if (s.type === "styles") return { ...s, picks: s.values.map((v, i) => ({ label: v.label, art: v.art, on: i === 0 })) };
    if (s.type === "text") return { ...s, value: "" };
    if (s.type === "upload") return { ...s, file: null, uploading: false };
    if (s.type === "examples") return { ...s, target: text }; // examples fill the page's text box
    if (s.type === "hotlinks") return { ...s, target: text, links: [] };
    return s;
  });
}
Page({
  ...featureActions,
  ...exampleHandlers,
  destroyed: false,
  data: { title: "", action: "", tab: 0, sections: [] as View[], art: {} as Record<string, string> },
  onLoad(query: Record<string, string>) {
    const config = CONFIGS[query.key] || CONFIGS.avatar;
    this.setData({ title: config.title, action: config.action, sections: views(config.sections) });
  },
  onShow() {
    enterPage(this);
    // Style cards and sample pictures come from the decorative art.
    showArt(this, (art) => ({
      art: { styleGeneral: art.styleGeneral, styleRomance: art.styleRomance, styleXianxia: art.styleXianxia, styleSuspense: art.styleSuspense, styleGuoman: art.styleGuoman,
        sampleFace1: art.sampleFace1, sampleFace2: art.sampleFace2, sampleFace3: art.sampleFace3 },
    }));
    void loadHotLinks(this);
  },
  pick(e: WechatMiniprogram.TouchEvent) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    const s = this.data.sections[section] as View | undefined;
    if (!s?.picks) return;
    const multi = s.type === "chips" && s.multi;
    const picks = s.picks.map((p: Pick, i: number) => ({ ...p, on: multi ? (i === index ? !p.on : p.on) : i === index }));
    this.setData({ [`sections[${section}].picks`]: picks, ...(s.type === "tabs" ? { tab: Number(index) } : {}) });
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ [`sections[${e.currentTarget.dataset.section}].value`]: e.detail.value });
  },
  clear(e: WechatMiniprogram.TouchEvent) {
    this.setData({ [`sections[${e.currentTarget.dataset.section}].value`]: "" });
  },
  example(e: WechatMiniprogram.TouchEvent) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    const s = this.data.sections[section] as View;
    if (s.type !== "examples" || s.target === undefined || s.target < 0) return;
    this.setData({ [`sections[${s.target}].value`]: s.values[index].text });
  },
  toggle(e: WechatMiniprogram.SwitchChange) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    this.setData({ [`sections[${section}].items[${index}].on`]: e.detail.value });
  },
  onUnload() {
    this.destroyed = true;
  },
});
