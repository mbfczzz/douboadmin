import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { pageInfo, type PageId } from "../navigation";
export default function PageHeader({
  page,
  loading = false,
  onRefresh,
  children,
  title,
}: {
  page: PageId;
  loading?: boolean;
  onRefresh?: () => void;
  children?: ReactNode;
  title?: string;
}) {
  const [defaultTitle, description] = pageInfo[page];
  return (
    <div className="page-heading">
      <div>
        <h1>{title || defaultTitle}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">
        {onRefresh && (
          <button className="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spinning" : ""} />
            刷新
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
