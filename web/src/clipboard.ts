// navigator.clipboard needs HTTPS or localhost; over plain HTTP fall back to
// copying from a temporary off-screen textarea.
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
  const active = document.activeElement as HTMLElement | null;
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  active?.focus({ preventScroll: true });
  if (!copied) throw new Error("copy failed");
}
