// The project materials a message is about: "图片2" / "@视频1" by number, or
// "这张图" / "这个视频" when the project has only one of that kind. Pictures
// go only to models that read them; videos always go (the server has them
// watched by 视频理解 and tells the model what is in them).
type Material = { id: string; isImage: boolean; label: string };

function named(text: string, items: Material[], word: string, loose: RegExp): string[] {
  const names = new Set<string>();
  const re = new RegExp(word + "\\s*(\\d+)", "g");
  for (let m = re.exec(text); m; m = re.exec(text)) names.add(word + m[1]);
  const ids = items.filter((p) => names.has(p.label)).map((p) => p.id);
  if (!ids.length && items.length === 1 && loose.test(text)) return [items[0].id];
  return ids;
}

export function namedPictures(text: string, materials: Material[]): string[] {
  return named(text, materials.filter((m) => m.isImage), "图片", /图|照片|截图/);
}

export function namedMaterials(text: string, materials: Material[], seesPictures: boolean): string[] {
  const videos = named(text, materials.filter((m) => !m.isImage), "视频", /视频|片子|录像|这条|这段/);
  return [...(seesPictures ? namedPictures(text, materials) : []), ...videos];
}
