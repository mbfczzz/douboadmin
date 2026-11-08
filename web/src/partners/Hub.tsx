import type { PageProps } from "../navigation";
import Providers from "./Providers";
import "./partners.css";
import "./provider-layout.css";

export default function Hub({ notify }: PageProps) {
  return (
    <div className="catalog-page partner-hub">
      <Providers notify={notify} />
    </div>
  );
}
