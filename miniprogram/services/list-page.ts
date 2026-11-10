import type { PagedView } from "./page-contracts";

export function movePage(view: PagedView, delta: number) {
  const page = view.data.page + delta;
  if (
    view.fetching ||
    view.data.loading ||
    page < 1 ||
    (page - 1) * 20 >= view.data.total
  )
    return;
  view.setData({ page, loading: true });
  void view.load();
}
