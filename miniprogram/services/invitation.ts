import { shareFrom } from "./access";
let invite = "";
let consumed = "";

// WeChat delivers unlimited-code scene separately from the numeric launch scene.
export function captureInvite(query: Record<string, string | undefined> = {}) {
  if (!query.scene) return;
  try {
    const code = shareFrom(decodeURIComponent(query.scene));
    if (code !== consumed) invite = code;
  } catch {
    /* Unrelated or malformed scenes never register an account. */
  }
}
export function pendingInvite() {
  return invite;
}
export function clearInvite() {
  consumed = invite;
  invite = "";
}

export function scannedInvite(value: { result: string; path?: string }) {
  const scene = value.path?.match(/(?:[?&])scene=([^&]+)/)?.[1];
  return shareFrom(scene ? decodeURIComponent(scene) : value.result);
}
