export const videoDurations = Array.from({ length: 30 }, (_, i) => i + 1);
export const videoResolutions = ["480p", "720p", "768p", "1080p", "2k", "4k"];
export const imageResolutions = ["1k", "2k", "4k"];
export const parameterRatios = [
  "1:1",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
];
export const imageQualities = ["low", "medium", "high"];

// Preserve existing spelling for price keys (e.g. 1K), but never add extra choices.
export function parameterOptions(allowed: string[], existing: string[]) {
  return allowed.map((v) => existing.find((x) => x.toLowerCase() === v) || v);
}

export function filterOptions(values: string[], allowed: string[]) {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (!allowed.includes(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
