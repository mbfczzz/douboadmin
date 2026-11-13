export interface InvitePoster {
  title: string;
  owner?: string;
  code: string;
}
export const POSTER_WIDTH = 720;
export const POSTER_HEIGHT = 1060;
// Canvas 2D subset shared by the browser and WeChat; no DOM or platform imports.
export interface PosterContext {
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: any, x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
}
function text(
  c: PosterContext,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  c.font = `${bold ? "600 " : ""}${size}px sans-serif`;
  c.fillStyle = color;
  c.fillText(value, x, y);
}
function ownerLines(c: PosterContext, owner: string, size: number, width: number) {
  c.font = `600 ${size}px sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(owner)) {
    if (c.measureText(line + char).width > width) {
      lines.push(line);
      line = "";
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines.length > 2 ? [lines[0], lines[1].slice(0, -1) + "…"] : lines;
}
// Presented exactly like WeChat's own mini-program code: a plain white
// card, the official round code large and centred, the app name and
// "微信扫一扫，使用小程序" under it. Only the inviter and the invite code are
// added, in quiet grey type.
export function drawInvitePoster(
  c: PosterContext,
  image: any,
  data: InvitePoster,
) {
  const ink = "#111111", grey = "#888888";
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  c.textBaseline = "top";
  c.textAlign = "center";
  const lines = ownerLines(c, data.owner || "豆播 AI", 30, 600);
  lines.forEach((line, i) => text(c, line, 360, 96 + i * 40, 30, ink, true));
  text(c, data.title, 360, 104 + lines.length * 40, 22, grey);
  const top = 186 + lines.length * 40;
  c.imageSmoothingEnabled = false;
  c.drawImage(image, 120, top, 480, 480);
  text(c, "豆播AI", 360, top + 512, 30, ink, true);
  text(c, "微信扫一扫，使用小程序", 360, top + 558, 22, grey);
  const code = data.code.slice(0, 4) + "-" + data.code.slice(4);
  text(c, "邀请码 " + code, 360, POSTER_HEIGHT - 132, 24, ink);
  text(c, "识别后自动带入邀请码，完成登记后由超级管理员开通", 360, POSTER_HEIGHT - 92, 19, grey);
}
