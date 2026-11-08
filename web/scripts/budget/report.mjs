export const kib = (value) => `${(value / 1024).toFixed(2)} KiB`;
const safe = (text) =>
  String(text)
    .replaceAll("|", "\\|")
    .replace(/[\r\n]/g, " ");

export function markdown(report, baseline) {
  const rows = [
    ["Initial JS", "initialJSGzipBytes"],
    ["Initial CSS", "initialCSSGzipBytes"],
    ["All JS, including lazy chunks", "totalJSGzipBytes"],
    ["All CSS", "totalCSSGzipBytes"],
  ].map(
    ([label, key]) =>
      `| ${label} | ${kib(report[key])} | ${baseline ? kib(report[key] - baseline[key]) : "new"} |`,
  );
  return [
    "# Web transfer budget",
    "",
    "Gzip transfer sizes of emitted application assets. Lazy modules are not part of initial loading.",
    "This report is not a WeChat package measurement or a node_modules size report.",
    "",
    "| Metric | Current | Change from baseline |",
    "| --- | ---: | ---: |",
    ...rows,
    "",
    "## Additional assets on first opening each lazy entry",
    "",
    "Static dependencies are included and deduplicated; assets already in initial loading are excluded.",
    "",
    "| Entry | Kind | Additional JS | Additional CSS | JS change |",
    "| --- | --- | ---: | ---: | ---: |",
    ...Object.entries(report.entries).map(([name, entry]) => {
      const previous = baseline?.entries[name];
      return `| ${safe(name)} | ${entry.kind} | ${kib(entry.jsGzipBytes)} | ${kib(entry.cssGzipBytes)} | ${previous ? kib(entry.jsGzipBytes - previous.jsGzipBytes) : "new"} |`;
    }),
    "",
    "## Checks",
    "",
    ...report.errors.map((text) => `- ERROR: ${safe(text)}`),
    ...report.warnings.map((text) => `- WARNING: ${safe(text)}`),
    ...(!report.errors.length && !report.warnings.length
      ? ["All checks passed."]
      : []),
    "",
  ].join("\n");
}

export function printSummary(report) {
  console.log(
    `Initial: JS ${kib(report.initialJSGzipBytes)}, CSS ${kib(report.initialCSSGzipBytes)}`,
  );
  console.log(
    `All emitted assets: JS ${kib(report.totalJSGzipBytes)}, CSS ${kib(report.totalCSSGzipBytes)}, ${report.chunks} files`,
  );
  for (const message of report.warnings) console.log(`WARNING ${message}`);
  for (const message of report.errors) console.error(`ERROR ${message}`);
  if (report.errors.length) {
    const largest = new Map(report.initialAssets.map((a) => [a.file, a]));
    for (const entry of Object.values(report.entries))
      for (const item of entry.assets) largest.set(item.file, item);
    console.error("Largest assets:");
    for (const asset of [...largest.values()]
      .sort((a, b) => b.gzipBytes - a.gzipBytes)
      .slice(0, 8)) {
      console.error(`  ${asset.file}: ${kib(asset.gzipBytes)}`);
    }
    console.error(
      "Inspect dist/budget.json and dist/budget.md. Review intentional growth before explicitly updating the baseline.",
    );
  }
}
