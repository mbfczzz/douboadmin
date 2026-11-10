const codes: Record<string, string> = {
  member: "ABCD2345",
  s1: "KMNP2345",
  s2: "WXYZ6789",
  bind: "ABCD6789",
};

export function surfaceCode(path: string, qr: string) {
  if (/^\/partners\/[^/]+\/code-uses$/.test(path))
    return { items: [], page: 1, size: 20, total: 0 };
  const match = path.match(/^\/partners\/([^/]+)\/codes\/(\w+)$/);
  if (!match) return;
  const code = codes[match[2]];
  return match[1] === "qa-provider" && match[2] === "bind"
    ? {
        code,
        user: {
          id: "qa-owner",
          nickname: "小华",
          name: "华东负责人",
          phone: "13900000001",
        },
      }
    : { code, qr };
}
