import { useEffect, useState } from "react";

export default function BrandLogo() {
  const [icon, setIcon] = useState("/api/brand-icon");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/branding", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { icon?: string };
        if (!controller.signal.aborted && data.icon) setIcon(data.icon);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <img
      key={icon}
      className="project-logo"
      src={icon}
      alt="豆播 AI"
      width="160"
      height="78"
      onError={(event) => {
        const image = event.currentTarget;
        if (new URL(image.src).pathname !== "/media/brand/doubo.png")
          image.src = "/media/brand/doubo.png";
      }}
    />
  );
}
