export function pagedFixture(value: unknown, url: URL): unknown {
  if (!url.searchParams.has("page") || !Array.isArray(value)) return value;
  const page = Number(url.searchParams.get("page")),
    size = Number(url.searchParams.get("size") || 20);
  return {
    items: value.slice((page - 1) * size, page * size),
    page,
    size,
    total: value.length,
  };
}
