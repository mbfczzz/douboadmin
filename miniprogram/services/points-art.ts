// Order covers (assets/photos/tier-*.jpg, generated with Codex): amber glass
// four-point stars, the same ✦ that marks points, never coins. One star,
// three, a jar, a heap: bigger orders show more.
const TIERS = [
  "/assets/photos/tier-1.jpg",
  "/assets/photos/tier-2.jpg",
  "/assets/photos/tier-3.jpg",
  "/assets/photos/tier-4.jpg",
];

// For a single order, by what was paid: under ¥20, ¥80, ¥150, then above.
export function tierByAmount(amountFen: number) {
  return TIERS[amountFen < 2000 ? 0 : amountFen < 8000 ? 1 : amountFen < 15000 ? 2 : 3];
}
