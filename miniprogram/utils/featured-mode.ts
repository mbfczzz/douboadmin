// Which view the 模板 tab page shows: 模板 or 优秀 (five native tab pages).
let featured = false;
export const featuredOn = () => featured;
export function setFeatured(on: boolean) {
  featured = on;
}
