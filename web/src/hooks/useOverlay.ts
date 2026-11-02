import { useEffect, useRef, type RefObject } from "react";

let locks = 0;
let originalOverflow = "";

// Dialogs and the mobile menu share focus, navigation and scroll ownership.
export function useOverlay(
  anchor: RefObject<HTMLElement | null>,
  onClose: () => void,
  open = true,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const panel = anchor.current?.closest<HTMLElement>('[role="dialog"]');
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!locks++) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),a[href],video[controls],summary,[tabindex="0"]',
        ),
      ).filter(
        (el) =>
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility === "visible" &&
          !el.matches(":disabled") &&
          !el.closest("details:not([open]) > :not(summary)"),
      );
    const initial = focusable();
    (
      initial.find((el) => el.matches("input,textarea,select")) ||
      initial[0] ||
      panel
    ).focus();
    const handle = (e: Event) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs.item(dialogs.length - 1) !== panel) return;
      const keyboard = e as KeyboardEvent;
      if (
        e.type === "workspace:navigate" ||
        (keyboard.key === "Escape" && !document.fullscreenElement)
      ) {
        e.preventDefault();
        close.current();
      }
      if (keyboard.key === "Tab") {
        const elements = focusable();
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (
          index < 0 ||
          (keyboard.shiftKey ? index === 0 : index === elements.length - 1)
        ) {
          e.preventDefault();
          (
            elements[keyboard.shiftKey ? elements.length - 1 : 0] || panel
          ).focus();
        }
      }
    };
    const events = ["keydown", "workspace:navigate"];
    events.forEach((type) => window.addEventListener(type, handle));
    return () => {
      events.forEach((type) => window.removeEventListener(type, handle));
      if (!--locks) document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [anchor, open]);
}
