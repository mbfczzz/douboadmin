import {
  legalConsent,
  needConsent,
  openPrivacy,
} from "../../services/legal-consent";
import type { ConsentPage } from "../../services/legal-consent";

export const entryHandlers = {
  legalConsent,
  needConsent,
  privacy: openPrivacy,
  brandError(this: ConsentPage) {
    this.setData({ brandIcon: "" });
  },
};
