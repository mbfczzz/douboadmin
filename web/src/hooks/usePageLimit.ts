import { useEffect } from "react";

// A filtered last page can disappear after its final row is reviewed.
export function usePageLimit(
  page: number,
  setPage: (page: number) => void,
  data?: { total: number; size?: number },
) {
  const last = data
    ? Math.max(1, Math.ceil(data.total / (data.size || 20)))
    : page;
  useEffect(() => {
    if (page > last) setPage(last);
  }, [page, last, setPage]);
}
