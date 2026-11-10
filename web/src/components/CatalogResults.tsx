import { useLayoutEffect, useRef, type ReactNode } from "react";
import RequestState from "./RequestState";
import "./catalog-results.css";

// Preserve the list's occupied space during a query without displaying records
// from another filter. Controls live outside this region and never move.
export default function CatalogResults({
  loading,
  error,
  retry,
  children,
  label,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: ReactNode;
  label: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const height = useRef(240);
  useLayoutEffect(() => {
    if (loading || !frame.current) return;
    const element = frame.current;
    const remember = () => {
      height.current = Math.max(240, element.getBoundingClientRect().height);
    };
    remember();
    const observer = new ResizeObserver(remember);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, children]);
  return (
    <div
      ref={frame}
      className="catalog-results"
      role="region"
      aria-label={label}
      aria-busy={loading}
      style={loading ? { minHeight: height.current } : undefined}
    >
      {loading ? (
        <div className="catalog-results-loading">
          <RequestState loading retry={retry} />
        </div>
      ) : (
        <>
          <RequestState error={error} retry={retry} />
          {children}
        </>
      )}
    </div>
  );
}
