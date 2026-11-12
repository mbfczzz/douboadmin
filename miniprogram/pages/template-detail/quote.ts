import { estimateCost } from "../../services/estimate";
import { points } from "../../services/business";
import { sessionToken } from "../../services/session";
import type { Row, Template } from "../../services/types";

import type { QuotePage } from "../../services/page-contracts";

// Template parameters are fixed, so one estimate per load is enough.
export function loadQuote(page: QuotePage, t: Row<Template>) {
  page.quoteAbort?.();
  const owner = sessionToken();
  if (!owner || !t.data.model) {
    page.setData({ quoteText: "" });
    return;
  }
  const request = estimateCost(
    {
      kind: "video",
      model: t.data.model,
      resolution: t.data.resolution,
      ratio: t.data.ratio,
      quality: t.data.quality,
      duration: t.data.duration || 0,
    },
    owner,
  );
  page.quoteAbort = request.abort;
  request.promise.then(
    (quote) => {
      if (page.destroyed) return;
      page.setData({
        quoteText:
          quote.units === 0
            ? "本次不扣积分"
            : `预计 ${points(quote.units)} 积分`,
      });
    },
    () => {
      if (!page.destroyed) page.setData({ quoteText: "" });
    },
  );
}
