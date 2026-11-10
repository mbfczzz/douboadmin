import { resetNavigation } from "./navigation";
import { trackVisit } from "../services/analytics";

import type { MotionPage } from "../services/page-contracts";

// Alternating names restart the animation when an existing tab is shown again.
// Only opacity animates on page roots, preserving fixed-position descendants.
let visiblePage: MotionPage | undefined;

export function enterPage(page: MotionPage) {
  resetNavigation(page);
  trackVisit(page);
  // Returning from the camera, album or app background is not a new route.
  if (visiblePage === page) return;
  visiblePage = page;
  page.setData({
    pageMotion: page.data.pageMotion === "enter-a" ? "enter-b" : "enter-a",
  });
}
