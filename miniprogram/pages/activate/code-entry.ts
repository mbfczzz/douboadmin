import { typedCode } from "../../services/access";

// The 8-character invite code is typed into one hidden input and shown as
// eight cells, four + four around a fixed dash. The dash is only display.
type Slot = { char: string };
const slots = (raw: string): Slot[] =>
  Array.from({ length: 8 }, (_, i) => ({ char: raw[i] || "" }));

export const codeState = {
  code: "", // display form, "KMNP-2345"
  codeRaw: "", // what the hidden input holds, "KMNP2345"
  codeSlots: slots(""),
  codeCursor: 0,
  codeFocus: false,
  codeReady: false,
  codeHint: "",
  codeMode: false, // false: the scan viewfinder; true: typing a code
};

type CodePage = {
  data: typeof codeState;
  setData(v: Partial<typeof codeState>): void;
};

// Applies typed or pasted text; returns what the hidden input should hold.
export function enterCode(page: CodePage, value: string) {
  const typed = typedCode(value, page.data.code);
  page.setData({
    code: typed.shown,
    codeRaw: typed.raw,
    codeSlots: slots(typed.raw),
    codeCursor: Math.min(typed.raw.length, 7),
    codeReady: typed.raw.length === 8,
    codeHint: typed.dropped
      ? "邀请码由大写字母和数字组成，不含 I、O、0、1"
      : "",
  });
  return typed.raw;
}

// Empties the code but keeps whichever entry (scan or code) is showing.
export function clearCode(page: CodePage) {
  const { codeMode: _, ...empty } = codeState;
  page.setData({ ...empty, codeSlots: slots("") });
}

// Pastes a copied code (or a copied QR content); a full code goes straight on.
export function pasteCode(page: CodePage, complete: () => void) {
  wx.getClipboardData({
    success: (r) => {
      if (enterCode(page, r.data || "").length === 8) complete();
      else wx.showToast({ title: "剪贴板里没有完整的邀请码", icon: "none" });
    },
  });
}
