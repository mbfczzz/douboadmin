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
  // Pages show their skeleton only when empty, so the rows stay until the
  // next page arrives; it starts at its top.
  view.setData({ page, loading: true });
  wx.pageScrollTo?.({ scrollTop: 0, duration: 0 });
  void view.load();
}
