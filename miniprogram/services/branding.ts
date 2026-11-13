import { httpsImage } from "./media";

type BrandPage = {
  brandRevision?: number;
  destroyed: boolean;
  setData(data: { brandIcon: string }): void;
};

// Branding is public and independent of configuration/relay availability.
// Refresh the signed URL on each page load; never persist it across sessions.
export async function loadBrand(page: BrandPage, fetch: () => Promise<{ icon?: string }>) {
  const revision = page.brandRevision = (page.brandRevision || 0) + 1;
  try {
    const { icon } = await fetch();
    if (!page.destroyed && page.brandRevision === revision)
      page.setData({ brandIcon: httpsImage(icon) });
  } catch {
    // Keep the visible logo or its text placeholder; login is independent.
  }
}
