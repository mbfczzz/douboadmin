const KiB = 1024;

// Transfer budgets for a first visit, not a cap on the number of features.
export const limits = Object.freeze({
  initialJSGzipBytes: 96 * KiB,
  initialCSSGzipBytes: 16 * KiB,
  entryJSGzipBytes: 40 * KiB,
  entryCSSGzipBytes: 16 * KiB,
});

export function evaluate(report, baseline) {
  const errors = [],
    warnings = [];
  const kib = (value) => `${(value / KiB).toFixed(2)} KiB`;
  function absolute(name, value, limit) {
    if (value > limit)
      errors.push(
        `${name}: ${kib(value)} > ${kib(limit)} (${value - limit} bytes over)`,
      );
    else if (value > limit * 0.8)
      warnings.push(`${name}: ${kib(value)} uses over 80% of ${kib(limit)}`);
  }
  function growth(name, value, previous, floor, ratio, blocking = true) {
    if (previous === undefined || value <= previous) return;
    const delta = value - previous,
      allowance = Math.max(floor, previous * ratio);
    if (delta <= allowance) return;
    const message = `${name}: +${kib(delta)} from ${kib(previous)}; review limit +${kib(allowance)}`;
    (blocking ? errors : warnings).push(message);
  }
  absolute("Initial JS", report.initialJSGzipBytes, limits.initialJSGzipBytes);
  absolute(
    "Initial CSS",
    report.initialCSSGzipBytes,
    limits.initialCSSGzipBytes,
  );
  if (baseline) {
    growth(
      "Initial JS growth",
      report.initialJSGzipBytes,
      baseline.initialJSGzipBytes,
      8 * KiB,
      0.15,
    );
    growth(
      "Initial CSS growth",
      report.initialCSSGzipBytes,
      baseline.initialCSSGzipBytes,
      2 * KiB,
      0.25,
    );
    growth(
      "Total JS trend",
      report.totalJSGzipBytes,
      baseline.totalJSGzipBytes,
      16 * KiB,
      0.2,
      false,
    );
    growth(
      "Total CSS trend",
      report.totalCSSGzipBytes,
      baseline.totalCSSGzipBytes,
      4 * KiB,
      0.25,
      false,
    );
  }
  for (const [name, entry] of Object.entries(report.entries)) {
    if (entry.eagerlyLoaded)
      errors.push(
        `${name}: a page or workspace was included in the initial bundle`,
      );
    absolute(
      `${name} additional JS`,
      entry.jsGzipBytes,
      limits.entryJSGzipBytes,
    );
    absolute(
      `${name} additional CSS`,
      entry.cssGzipBytes,
      limits.entryCSSGzipBytes,
    );
    if (baseline?.entries[name]) {
      growth(
        `${name} JS growth`,
        entry.jsGzipBytes,
        baseline.entries[name].jsGzipBytes,
        8 * KiB,
        0.5,
      );
      growth(
        `${name} CSS growth`,
        entry.cssGzipBytes,
        baseline.entries[name].cssGzipBytes,
        2 * KiB,
        0.5,
      );
    }
  }
  return { errors, warnings };
}
