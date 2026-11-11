import { resetNavigation } from "./navigation";
import { trackVisit } from "../services/analytics";

import type { MotionPage } from "../services/page-contracts";

// Native routes own the transition. Replaying opacity on a cached page causes
// a full-screen flash on every tab switch and back navigation.
export function enterPage(page: MotionPage) {
  resetNavigation(page);
  trackVisit(page);
}
