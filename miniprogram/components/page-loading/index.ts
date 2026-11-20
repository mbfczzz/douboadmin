// Loading for slow first loads. mode "page": a centred spinner and what is
// being loaded, in place of a page that would otherwise show empty boxes and
// disabled buttons ("inline": the same, sized for a card or under a heading). mode "hint": only the slow-network line, under a list's
// skeleton. Both appear late on purpose (CSS delays, no timers): nothing
// flashes on a fast network, and the slow line shows after a few seconds.
Component({
  options: { virtualHost: true },
  properties: {
    show: { type: Boolean, value: false },
    text: { type: String, value: "正在加载…" },
    mode: { type: String, value: "page" },
  },
  data: {},
});
