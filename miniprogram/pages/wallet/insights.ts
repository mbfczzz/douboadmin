import { loadConfig } from "../../utils/config-cache";
import { request } from "../../services/request";
import { estimateCost } from "../../services/estimate";
import { sessionToken } from "../../services/session";
import { money, points } from "../../services/business";
import type { VirtualProduct } from "../../services/business";
import type { Config, Model, Row } from "../../services/types";
import type { Ledger } from "../../services/wallet-ledger";
import { ledgerView } from "../../services/wallet-ledger";
import { withDays } from "../../utils/day";
import { templateCovers } from "../../services/covers";
import { tierByRank } from "../../services/points-art";

// Everything here is derived from real data: product prices, live quotes
// for each kind's default model, and ledger rows. Nothing is invented.

const per100 = (fen: number, units: number) => money(Math.round((fen * 10000) / units)); // ¥ per 100 points

export function productCards(products: VirtualProduct[]) {
  const sizes = products.map((p) => p.pointsUnits).sort((a, b) => a - b);
  const rate = (p: VirtualProduct) => p.pointsUnits / p.amountFen;
  const valid = products.filter((p) => p.amountFen > 0 && p.pointsUnits > 0);
  const worst = Math.min(...valid.map(rate)),
    best = Math.max(...valid.map(rate));
  return products.map((p) => {
    const r = p.amountFen > 0 && p.pointsUnits > 0 ? rate(p) : 0;
    const bonus = r && worst ? Math.round((r / worst - 1) * 100) : 0;
    return {
      id: p.id,
      name: p.name,
      amount: money(p.amountFen),
      points: points(p.pointsUnits),
      units: p.pointsUnits,
      per100: r ? per100(p.amountFen, p.pointsUnits) : "",
      bonus: bonus >= 1 ? `多得 ${bonus}%` : "",
      best: valid.length > 1 && r === best && best > worst,
      photo: tierByRank(sizes.indexOf(p.pointsUnits), products.length),
    };
  });
}

// Ledger rows gain their day heading and the balance left after each change.
export function ledgerRows(rows: Row<Ledger>[]) {
  return withDays(rows).map((row) => ({ ...ledgerView(row), time: row.clock, day: row.day, showDay: row.showDay, after: points(row.data.availableAfter) }));
}

type InsightPage = {
  destroyed?: boolean;
  revision?: number;
  data: { info: { wallet: { availableUnits: number } } | null };
  setData(value: Record<string, unknown>): void;
};
const defaults = (m: Model) => ({
  kind: m.kind,
  model: m.id,
  resolution: m.resolutions?.[0] || "",
  ratio: m.ratios?.[0] || "",
  quality: m.qualities?.[0] || "",
  duration: m.kind === "video" ? m.durations?.[0] || 5 : 0,
});

// "积分能做什么": quote one default image and one default video, then say how
// many of each the current balance covers. Fails quietly.
// Quotes rarely change; price examples at most every two minutes per account.
const quoted = new Map<string, number>();
export async function loadInsights(page: InsightPage) {
  const owner = sessionToken();
  const revision = page.revision;
  const shown = (page.data as { uses?: { units: number; count: number }[] }).uses || [];
  if (Date.now() - (quoted.get(owner) || 0) < 2 * 60 * 1000 && shown.length) {
    // Same prices, new balance: recount without asking the server.
    const available = page.data.info?.wallet.availableUnits || 0;
    page.setData({ uses: shown.map((u) => ({ ...u, count: Math.floor(available / u.units) })) });
    return;
  }
  quoted.set(owner, Date.now());
  try {
    const config = await loadConfig();
    const pick = (kind: string) => config.models.find((m) => m.kind === kind && !m.demo) || config.models.find((m) => m.kind === kind);
    const models = [pick("image"), pick("video")].filter(Boolean) as Model[];
    const quotes = await Promise.all(models.map((m) => estimateCost(defaults(m), owner).promise.then((q) => ({ m, q })).catch(() => null)));
    if (page.destroyed || !page.data.info || sessionToken() !== owner || page.revision !== revision) return;
    const available = page.data.info.wallet.availableUnits;
    const uses = quotes
      .filter((x): x is NonNullable<typeof x> => !!x && x.q.billingEnabled && x.q.units > 0)
      .map(({ m, q }) => ({
        kind: m.kind,
        title: m.kind === "video" ? `${defaults(m).duration} 秒视频` : "图片",
        cost: points(q.units),
        units: q.units,
        count: Math.floor(available / q.units),
        unit: m.kind === "video" ? "条" : "张",
        model: m.name,
      }));
    page.setData({ uses });
  } catch {
    // keep the card hidden
  }
}

type ArtPage = {
  destroyed?: boolean;
  revision?: number;
  data: { uses: { kind: string }[] };
  setData(value: Record<string, unknown>): void;
};

// Each "能做什么" tile shows a real template cover of its kind. Packages use
// product photos (services/points-art) and need no covers.
export async function loadArt(page: ArtPage) {
  const owner = sessionToken(), revision = page.revision;
  const covers = (await templateCovers()).map((c) => c.cover);
  if (page.destroyed || !covers.length || sessionToken() !== owner || page.revision !== revision) return;
  page.setData({
    useArt: { image: covers[1 % covers.length], video: covers[2 % covers.length] },
  });
}
