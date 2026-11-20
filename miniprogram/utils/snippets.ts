// The parts of a reply worth copying on their own: labelled lines (标题：…,
// 文案：…, 提示词：…), code blocks, hashtags and quoted captions or lines.
// Each becomes a 复制 chip under the reply.
const LABELS = "标题|副标题|文案|口播|台词|旁白|字幕|提示词|prompt|话题|标签|开头|钩子|结尾|广告语|slogan|标语|简介|评论|回复";
const labelled = new RegExp(`^[\\s\\-·•*\\d.、)）]*(?:${LABELS})[^：:\\n]{0,6}[：:]\\s*(.+)$`, "i");
const quoted = /[“「『"]([^”」』"\n]{6,200})[”」』"]/g;
const fence = /```[a-zA-Z]*\n?([\s\S]*?)```/g;
const unquote = (s: string) => s.trim().replace(/^[“「『"]+|[”」』"]+$/g, "").trim();
const MAX = 6;

export function keyContent(text: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    s = unquote(s);
    if (s.length >= 4 && s.length <= 400 && !out.includes(s) && out.length < MAX) out.push(s);
  };
  fence.lastIndex = 0;
  for (let m = fence.exec(text); m; m = fence.exec(text)) add(m[1]);
  const prose = text.replace(fence, "");
  for (const line of prose.split("\n")) {
    const m = labelled.exec(line);
    if (m) add(m[1]);
  }
  const tags = prose.match(/#[^\s#，,。]{1,20}/g);
  if (tags && tags.length >= 2) add(Array.from(new Set(tags)).join(" "));
  quoted.lastIndex = 0;
  for (let m = quoted.exec(prose); m; m = quoted.exec(prose)) add(m[1]);
  return out;
}
