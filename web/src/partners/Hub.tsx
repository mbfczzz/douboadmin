import type { PageProps } from "../navigation";
import Providers from "./Providers";

export default function Hub({ notify }: PageProps) {
  return (
    <div className="catalog-page partner-hub">
      <Providers notify={notify} />
    </div>
  );
}
