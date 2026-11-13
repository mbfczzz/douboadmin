import { useEffect, useState } from "react";

type BrandAssets = { icon: string; modelIcons: Record<string, string> };
const empty: BrandAssets = { icon: "", modelIcons: {} };
let cached = empty,
  expires = 0,
  pending: Promise<BrandAssets> | undefined;

function readAssets() {
  if (Date.now() < expires) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch("/api/branding", { signal: AbortSignal.timeout(10000) })
    .then(async (response) => {
      if (!response.ok) throw new Error("品牌图片暂不可用");
      const data = await response.json();
      const https = (value: unknown): value is string =>
        typeof value === "string" && value.startsWith("https://");
      cached = {
        icon: https(data.icon) ? data.icon : "",
        modelIcons: Object.fromEntries(
          Object.entries(data.modelIcons || {}).filter(
            (entry): entry is [string, string] => https(entry[1]),
          ),
        ),
      };
      expires =
        Date.now() +
        (cached.icon && Object.keys(cached.modelIcons).length
          ? 3600000
          : 30000);
      return cached;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

// One shared request for the logo and model selector. Refresh expiring signatures.
export function useBrandAssets() {
  const [assets, setAssets] = useState(cached);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void readAssets()
        .then((value) => {
          if (active) setAssets(value);
        })
        .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return assets;
}
