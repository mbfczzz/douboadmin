import { ask } from "../confirm/ask";

export const unsavedForm = () =>
  document.querySelector<HTMLFormElement>("form[data-unsaved]");

// Resolves true when there is nothing unsaved or the user chooses to discard.
export async function canLeave() {
  const form = unsavedForm();
  if (!form) return true;
  if (form.getAttribute("aria-busy") === "true") return false;
  return (
    (await ask({
      title: "放弃未保存的修改？",
      message: "当前表单的改动还没有保存，离开后将丢失。",
      confirmText: "放弃修改",
      danger: true,
    })) !== false
  );
}

export function warnUnload(e: BeforeUnloadEvent) {
  if (unsavedForm()) {
    e.preventDefault();
    e.returnValue = "";
  }
}
