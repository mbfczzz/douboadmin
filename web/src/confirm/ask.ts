import type { ReactNode } from "react";

// In-app replacement for window.confirm / window.prompt, themed like the
// rest of the admin. Resolves to false when cancelled, otherwise to the
// entered reason ("" when no reason was requested).
export interface AskOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  reason?: {
    label: string;
    placeholder?: string;
    minLength?: number;
    maxLength?: number;
  };
  // Optional action run on confirm. The dialog stays open (and cannot be
  // closed) while it runs; a failure is shown inline and keeps the input.
  run?: (reason: string) => Promise<unknown>;
}
type Listener = (options: AskOptions | undefined) => void;
let listener: Listener | undefined;
let pending: ((value: false | string) => void) | undefined;

export function bindAsk(next: Listener) {
  listener = next;
  return () => {
    finishAsk(false);
    if (listener === next) listener = undefined;
  };
}
export function finishAsk(value: false | string) {
  const resolve = pending;
  pending = undefined;
  listener?.(undefined);
  resolve?.(value);
}
export function ask(options: AskOptions): Promise<false | string> {
  if (!listener) return Promise.resolve(false);
  finishAsk(false);
  // Focus returns to the opener through the dialog's overlay handling.
  return new Promise((resolve) => {
    pending = resolve;
    listener?.(options);
  });
}
