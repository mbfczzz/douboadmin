// Short "browser · system" label from a User-Agent string.
export function device(ua: string) {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /MicroMessenger/.test(ua)
      ? "微信"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  const system = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return [browser, system].filter(Boolean).join(" · ") || "未知设备";
}
