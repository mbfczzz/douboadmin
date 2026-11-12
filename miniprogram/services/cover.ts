// A broken thumbnail falls back to the list's placeholder icon.
export function dropCover(page: { data: Record<string, { id: string }[]>; setData(d: object): void }, id: string, ...lists: string[]) {
  const patch: Record<string, string> = {};
  for (const key of lists) {
    const i = page.data[key].findIndex((item) => item.id === id);
    if (i >= 0) patch[`${key}[${i}].thumbnailUrl`] = patch[`${key}[${i}].result`] = "";
  }
  page.setData(patch);
}
