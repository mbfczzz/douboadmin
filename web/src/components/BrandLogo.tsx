import { useEffect, useState } from "react";
import { useBrandAssets } from "../hooks/useBrandAssets";

export default function BrandLogo() {
  const { icon } = useBrandAssets();
  const [failed, setFailed] = useState("");
  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon && icon) favicon.href = icon;
  }, [icon]);
  if (!icon || failed === icon)
    return <span className="project-logo">豆播 AI</span>;
  return (
    <img
      key={icon}
      className="project-logo"
      src={icon}
      alt="豆播 AI"
      width="160"
      height="78"
      onError={() => setFailed(icon)}
    />
  );
}
