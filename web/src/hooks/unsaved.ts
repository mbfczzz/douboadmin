export function canLeave() {
  const form = document.querySelector("form[data-unsaved]");
  return (
    !form ||
    (form.getAttribute("aria-busy") !== "true" &&
      confirm("改动尚未保存，要放弃本次修改吗？"))
  );
}

export function warnUnload(e: BeforeUnloadEvent) {
  if (document.querySelector("form[data-unsaved]")) {
    e.preventDefault();
    e.returnValue = "";
  }
}
