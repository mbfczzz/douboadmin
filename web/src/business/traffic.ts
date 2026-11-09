// Anonymous visit statistics for the mini-program, web and app
// (see docs/traffic.md).
// Rates are ratios in [0, 1].
export interface Traffic {
  pv: number;
  uv: number;
  visits: number;
  pagesPerVisit: number;
  avgVisitSeconds: number;
  bounceRate: number;
  newVisitors: number;
  nextDayRetention: number;
  retentionBase: number;
  topPages: { page: string; pv: number; uv: number }[];
  entryPages: { page: string; visits: number }[];
  scenes: { scene: number; visits: number }[];
  sources?: { source: string; visits: number }[];
  // All-clients total only: each client's share.
  clients?: { client: string; pv: number; uv: number; visits: number }[];
  platforms: { platform: string; visits: number }[];
}
