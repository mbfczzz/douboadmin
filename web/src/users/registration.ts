import type { Profile } from "../business/types";

// Same rule as the server: the current phone passed the SMS check.
export const phoneVerified = (p: Profile) =>
  !!p.phone && p.verifiedPhone === p.phone;

// Name plus verified phone; until then the user stays on the first step.
export const registered = (p: Profile) => !!p.name?.trim() && phoneVerified(p);
