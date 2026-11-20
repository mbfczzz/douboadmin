// Decodes UTF-8 arriving in pieces (a streamed reply): a character split
// across two pieces is held until its last byte arrives. Mini-program
// runtimes do not all have TextDecoder.
export function utf8Pieces() {
  let rest: number[] = [];
  return (buf: ArrayBuffer): string => {
    const bytes = rest.concat(Array.from(new Uint8Array(buf)));
    let end = bytes.length;
    for (let i = bytes.length - 1; i >= Math.max(0, bytes.length - 4); i--) {
      const b = bytes[i];
      if ((b & 0xc0) === 0x80) continue; // a continuation byte: keep looking for the lead
      const size = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (bytes.length - i < size) end = i;
      break;
    }
    rest = bytes.slice(end);
    return decode(bytes, end);
  };
}

function decode(b: number[], end: number) {
  const out: number[] = [];
  for (let i = 0; i < end; ) {
    const c = b[i];
    if (c < 0x80) out.push(c), (i += 1);
    else if (c >= 0xf0) out.push(((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63)), (i += 4);
    else if (c >= 0xe0) out.push(((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63)), (i += 3);
    else if (c >= 0xc0) out.push(((c & 31) << 6) | (b[i + 1] & 63)), (i += 2);
    else (out.push(0xfffd), (i += 1)); // a stray continuation byte
  }
  let s = "";
  for (let i = 0; i < out.length; i += 4096) s += String.fromCodePoint(...out.slice(i, i + 4096));
  return s;
}
