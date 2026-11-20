// The project pictures a message is about: "图片2" or "@图片2" by number,
// or "这张图" when the project has only one picture.
type Material = { id: string; isImage: boolean; label: string };

export function namedPictures(text: string, materials: Material[]): string[] {
  const pictures = materials.filter((m) => m.isImage);
  const named = new Set<string>();
  const re = /图片\s*(\d+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) named.add("图片" + m[1]);
  const ids = pictures.filter((p) => named.has(p.label)).map((p) => p.id);
  if (!ids.length && pictures.length === 1 && /图|照片|截图/.test(text)) return [pictures[0].id];
  return ids;
}
