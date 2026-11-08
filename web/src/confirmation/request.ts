export interface ConfirmationOptions {
  title?: string;
  before?: unknown;
  labels?: Record<string, string>;
  secrets?: string[];
  extra?: Record<string, unknown>;
}
export interface ConfirmationPlan {
  title: string;
  warning?: string;
  rows: { label: string; before?: string; after: string }[];
}
type Listener = (plan: ConfirmationPlan | undefined) => void;
let listener: Listener | undefined;
let pending: ((approved: boolean) => void) | undefined;

export function bindConfirmation(next: Listener) {
  listener = next;
  return () => {
    finishConfirmation(false);
    if (listener === next) listener = undefined;
  };
}
export function confirmationPending() {
  return !!pending;
}
export function finishConfirmation(approved: boolean) {
  const resolve = pending;
  pending = undefined;
  listener?.(undefined);
  resolve?.(approved);
}
export function requestConfirmation(
  plan: ConfirmationPlan,
  signal?: AbortSignal | null,
) {
  if (!listener || pending || signal?.aborted) return Promise.resolve(false);
  const trigger = document.activeElement as HTMLElement | null;
  return new Promise<boolean>((resolve) => {
    const abort = () => finishConfirmation(false);
    pending = (approved) => {
      signal?.removeEventListener("abort", abort);
      resolve(approved && !signal?.aborted);
      if (!approved)
        requestAnimationFrame(() => {
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        });
    };
    signal?.addEventListener("abort", abort, { once: true });
    listener?.(plan);
  });
}
