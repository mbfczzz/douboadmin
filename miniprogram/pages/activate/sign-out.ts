import { logout, error } from "../../utils/api";
import { registerState, stopCountdown } from "./register";
import type { Register } from "../../services/page-contracts";

export async function signOutActivation(page: Register & { load(): Promise<void> }) {
  if (page.data.busy) return;
  page.setData({ busy: true });
  try {
    await logout();
    if (!page.destroyed) {
      stopCountdown(page);
      page.setData({ code: "", status: null, ...registerState });
      await page.load();
    }
  } catch (e) { if (!page.destroyed) error(e); }
  finally { if (!page.destroyed) page.setData({ busy: false }); }
}
