import type { Row, Template } from "../../services/types";

// A card's cover keeps its template's output shape (9:16 tall, 1:1 square…)
// within limits, so the two columns read as a real waterfall.
export function aspect(ratio: string) {
  const [w, h] = (ratio || "").split(":").map(Number);
  const r = w > 0 && h > 0 ? h / w : 4 / 3;
  return Math.min(1.6, Math.max(0.8, r));
}

export type Card = Row<Template> & {
  coverPct: string; // cover height as a percentage of its width
  length: string; // "5秒", or "" when unknown
  needs: string; // what making the same needs
};

export function card(row: Row<Template>): Card {
  const n = row.data.requiredImages || 0;
  return {
    ...row,
    coverPct: (aspect(row.data.ratio) * 100).toFixed(1) + "%",
    length: row.data.duration > 0 ? row.data.duration + "秒" : "",
    needs: n > 0 ? `上传 ${n} 张照片做同款` : "无需照片，直接生成",
  };
}

// Cards go to whichever column is shorter so far.
export function masonry(items: Row<Template>[]) {
  const columns = [
    { id: 0, items: [] as Card[], height: 0 },
    { id: 1, items: [] as Card[], height: 0 },
  ];
  for (const row of items) {
    const target = columns[0].height <= columns[1].height ? columns[0] : columns[1];
    target.items.push(card(row));
    target.height += aspect(row.data.ratio) + 0.18; // title and note below
  }
  return columns.map(({ id, items }) => ({ id, items }));
}

// Under the first category with no search, the first template is featured
// full width above the waterfall.
export function layout(items: Row<Template>[], featured: boolean) {
  const hero = featured && items.length >= 3 ? card(items[0]) : null;
  return { hero, columns: masonry(hero ? items.slice(1) : items) };
}
