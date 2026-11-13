import { estimateCost } from "../../services/estimate";
import { points } from "../../services/business";
import { sessionToken } from "../../services/session";
import { pricingInput } from "./input";

import type {
  VisibleEditor as Editor,
  EstimateTicket as Ticket,
} from "./editor-types";
const pending = new WeakMap<Editor, Ticket>();
export function cancelEstimate(page: Editor, reset = false) {
  const ticket = pending.get(page);
  pending.delete(page);
  if (ticket?.timer) clearTimeout(ticket.timer);
  ticket?.abort?.();
  if (reset && !page.destroyed)
    page.setData({
      quoteUnits: null,
      quoteBusy: false,
      quoteError: false,
      quoteText: "正在加载积分…", // a reset is not the user's mistake
    });
}
export function updateEstimate(page: Editor, force = false) {
  if (!page.visible || page.destroyed) return;
  const owner = sessionToken();
  const data = page.data;
  if (
    !owner ||
    data.modelsLoading ||
    data.modelError ||
    data.parameterError ||
    !data.model
  ) {
    cancelEstimate(page, true);
    page.setData({
      quoteText: !owner
        ? "登录后查看积分"
        : data.parameterError || (data.modelError && !data.modelsLoading)
          ? "请选择生成参数"
          : "正在加载积分…", // models still arriving: not the user's mistake
    });
    return;
  }
  const input = pricingInput(data);
  const key = owner + JSON.stringify(input);
  const previous = pending.get(page);
  if (
    !force &&
    previous?.key === key &&
    (data.quoteBusy || (!data.quoteError && Date.now() - previous.at < 30000))
  )
    return;
  cancelEstimate(page);
  const ticket: Ticket = { key, at: Date.now() };
  pending.set(page, ticket);
  // While a new quote is on its way the last price stays on screen (dragging
  // the duration slider must not flicker between a price and "正在估算").
  const shown = data.quoteUnits !== null && !data.quoteError;
  page.setData({
    quoteBusy: true,
    quoteError: false,
    ...(shown ? {} : { quoteUnits: null, quoteText: "正在估算积分…" }),
  });
  const current = () =>
    pending.get(page) === ticket && page.visible && !page.destroyed;
  ticket.timer = setTimeout(async () => {
    try {
      const request = estimateCost(input, owner);
      ticket.abort = request.abort;
      const quote = await request.promise;
      if (!current()) return;
      ticket.at = Date.now();
      page.setData({
        quoteUnits: quote.units,
        quoteBusy: false,
        quoteText:
          quote.units === 0
            ? "本次不扣积分"
            : `预计 ${points(quote.units)} 积分`,
      });
    } catch {
      if (!current()) return;
      page.setData({
        quoteUnits: null,
        quoteBusy: false,
        quoteError: !!sessionToken(),
        quoteText: sessionToken() ? "积分暂无法估算 · 重试" : "登录后查看积分",
      });
    }
  }, 300);
}
