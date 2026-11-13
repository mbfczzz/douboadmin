// Product photos for points packages (assets/photos/tier-*.jpg, generated
// with Codex): amber glass four-point stars, the same ✦ that marks points,
// never coins. One star, three, a jar, a box: bigger packs show more, so the
// wallet and the order list read the same way.
const TIERS = [
  "/assets/photos/tier-1.jpg",
  "/assets/photos/tier-2.jpg",
  "/assets/photos/tier-3.jpg",
  "/assets/photos/tier-4.jpg",
];

// Among the packages on offer: smallest gets tier 1, largest tier 4.
export function tierByRank(rank: number, count: number) {
  return TIERS[count <= 1 ? 1 : Math.round((rank * 3) / (count - 1))];
}

// For a single order, by what was paid: under ¥20, ¥80, ¥150, then above.
export function tierByAmount(amountFen: number) {
  return TIERS[amountFen < 2000 ? 0 : amountFen < 8000 ? 1 : amountFen < 15000 ? 2 : 3];
}
